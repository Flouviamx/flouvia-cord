export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash, randomBytes } from 'node:crypto';
import { sql, reqIp, withCaptureToken, withOrgTx } from '../../../../../lib/db';
import { stripeUpload, attachPersonDocument, attachPersonAdditionalDocument, retrieveAccount, updateConnectAccount, isAlreadyVerifiedError } from '../../../../../lib/billing';
import { translateStripeError } from '../../../../../lib/stripe-catalogs';
import { guardUpload } from '../../../../../lib/upload-guard';
import { auditConnect } from '../../../../../lib/connect-audit';
import { limitConnectMutation, limitConnectRead } from '../../../../../lib/connect-security';
import { sanitizeStripeRequirements } from '../../../../../lib/connect-fields';
import { documentosPara } from '../../../../../lib/identity-documents';
import { registrarEnvioKyc } from '../../../../../lib/kyc-evidencia';

// Vocabulario de estado de una sesión de captura:
//
//   pending      recién acuñada, nadie la ha abierto
//   en_progreso  el teléfono subió algo, pero todavía no el frente
//   min_cubierto llegó el frente — el proveedor ya puede verificar, pero la
//                sesión SIGUE ACEPTANDO reverso y comprobante de domicilio
//   cerrada      el teléfono terminó, o el escritorio la cerró
//   bloqueada    se agotaron los intentos
//
// Sólo los dos últimos rechazan una subida. Colapsar `min_cubierto` con
// `cerrada` es lo que dejaba el reverso inalcanzable.
const SESION_TERMINADA = new Set(['cerrada', 'bloqueada', 'completed']);

/** Tope ACUMULADO por sesión. El rate limit acota el ritmo, no el total. */
const MAX_INTENTOS = 12;
/** Fallos seguidos antes de bloquear: alguien probando, no alguien con mala luz. */
const MAX_FALLIDOS = 6;
/** Cuántos dispositivos distintos pueden reclamar el mismo enlace. */
const MAX_RECLAMOS = 2;
/** Ventana desde el primer uso, mucho más corta que el TTL absoluto. */
const VENTANA_USO_MS = 15 * 60 * 1000;
const COOKIE_DISPOSITIVO = 'cord_capture_device';

/**
 * Liga el enlace al primer dispositivo que lo usa.
 *
 * NO se puede atar nada al emitir: el flujo legítimo es a propósito de dos
 * dispositivos, y el segundo es desconocido en ese momento. Lo que sí se puede
 * atar es el PRIMER uso a los siguientes, con un secreto que el atacante no
 * tiene.
 *
 * Se ata en el primer POST y no en el GET a propósito: el QR se escanea muchísimo
 * desde el navegador embebido de WhatsApp o Instagram, y el usuario después hace
 * "Abrir en Safari" — otro contenedor de cookies. Atar en el GET dejaría fuera al
 * dueño legítimo del enlace, por eso se toleran hasta MAX_RECLAMOS.
 */
/**
 * Métricas de calidad medidas en el cliente.
 *
 * Vienen de un dispositivo público y NO son de confianza: se acotan a números
 * finitos y a un puñado de claves conocidas. No deciden nada —el guard del
 * servidor es el que valida— sólo se registran para poder calibrar después.
 */
function metricasDelCliente(raw: FormDataEntryValue | null): Record<string, number> {
    if (typeof raw !== 'string' || raw.length > 2000) return {};
    const CLAVES = ['nitidez', 'brillo', 'contraste', 'reflejo', 'croma', 'ladoLargo'];
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const salida: Record<string, number> = {};
        for (const k of CLAVES) {
            const v = Number(parsed?.[k]);
            if (Number.isFinite(v)) salida[k] = Math.round(v * 100) / 100;
        }
        return salida;
    } catch {
        return {};
    }
}

function deviceHashDe(cookie: string | undefined): string | null {
    if (!cookie) return null;
    return createHash('sha256').update(cookie).digest('hex');
}
/** Estados que el cliente debe leer como "ya no hay nada que subir". */
export const ESTADOS_FINALES: readonly string[] = ['cerrada', 'bloqueada', 'completed'];

// Ruta PÚBLICA (sin sesión) — el celular la abre al escanear el QR
// generado en /api/billing/connect/capture-session. El token es la única
// credencial: aleatorio, expira a los 10 min, y deja de aceptar subidas una
// vez que el mínimo requerido (el frente de la identificación) ya se completó.
async function loadSession(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const [[row]] = await withCaptureToken(token,
        sql`select * from identity_capture_sessions where token_hash = ${tokenHash}`,
    );
    if (!row) return { row: null, expired: false };
    const expired = new Date(row.expires_at as string).getTime() < Date.now();
    return { row, expired };
}

function publicState(row: any, org: any, expired: boolean) {
    // La guía documental viaja al teléfono como CATÁLOGO, no como país: el
    // dispositivo público no necesita saber dónde vive la persona, sólo qué
    // documentos puede traer y cuál lleva reverso.
    const soloPasaporte = row.doc_hint === 'pasaporte';
    const docs = documentosPara(String(org?.country_code || 'MX'), { soloPasaporte });
    return {
        ok: true,
        expired,
        status: row.status,
        captured: row.captured || {},
        // `soloPasaporte` se dice, no se descubre: si la persona vive en un país
        // distinto al de la cuenta, el proveedor sólo acepta pasaporte y ofrecerle
        // otra cosa la manda a un rechazo garantizado.
        soloPasaporte,
        documentos: docs.map((d) => ({ tipo: d.tipo, nombre: d.nombre, nombreEn: d.nombreEn, reverso: d.reverso })),
        org: { nombre: org?.nombre || 'tu proveedor', logoUrl: org?.logo_url || null, colorMarca: org?.color_marca || '#0a192f' },
    };
}

export const GET: APIRoute = async ({ params, request }) => {
    const token = params.token as string;
    const limited = await limitConnectRead(request, 'capture', token);
    if (limited) return limited;
    const { row, expired } = await loadSession(token);
    if (!row) return new Response(JSON.stringify({ ok: false, error: 'not_found' }), { status: 404 });

    // El org_id ya viene resuelto del token de captura (withCaptureToken, arriba),
    // así que la lectura de marca va en el carril normal de esa organización —
    // mismo patrón que /q/[token]: el token resuelve la identidad, withOrgTx hace
    // el trabajo.
    const [orgRows] = await withOrgTx(row.org_id as string, sql`select nombre, logo_url, color_marca, country_code from orgs where id = ${row.org_id}`);
    const org = orgRows[0];
    return new Response(JSON.stringify(publicState(row, org, expired)), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
};

export const POST: APIRoute = async ({ params, request, cookies }) => {
    const token = params.token as string;
    const limited = await limitConnectMutation(request, 'capture', token, 12);
    if (limited) return limited;
    const { row, expired } = await loadSession(token);
    if (!row) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    if (expired) return new Response(JSON.stringify({ error: 'expired' }), { status: 410 });

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const ahora = Date.now();

    // Ventana desde el primer uso: mucho más corta que el TTL absoluto, y sólo
    // empieza a correr cuando alguien de verdad abre el enlace.
    if (row.first_used_at && ahora - new Date(row.first_used_at as string).getTime() > VENTANA_USO_MS) {
        return new Response(JSON.stringify({ error: 'expired' }), { status: 410 });
    }

    // ── Binding de dispositivo ──────────────────────────────────────────────
    let deviceCookie = cookies.get(COOKIE_DISPOSITIVO)?.value;
    let cookieNueva = false;
    if (!deviceCookie) {
        deviceCookie = randomBytes(24).toString('base64url');
        cookieNueva = true;
    }
    const deviceHash = deviceHashDe(deviceCookie)!;
    const hashGuardado = row.device_hash as string | null;
    if (hashGuardado && hashGuardado !== deviceHash) {
        if ((row.device_reclamos as number ?? 0) >= MAX_RECLAMOS) {
            // Nunca un callejón sin salida: se explica y se dice qué hacer.
            return new Response(JSON.stringify({
                error: 'Por seguridad este enlace quedó ligado al primer teléfono que lo abrió. Genera uno nuevo desde tu computadora.',
            }), { status: 403, headers: { 'Content-Type': 'application/json' } });
        }
        await withCaptureToken(token, sql`
            update identity_capture_sessions
               set device_reclamos = device_reclamos + 1
             where token_hash = ${tokenHash}`);
    }

    // ── Tope acumulado, incrementado ANTES de llamar al proveedor ────────────
    //
    // Un intento que no se cuenta es un reintento gratis. Se hace en el propio
    // UPDATE (no read-modify-write) para que dos subidas simultáneas no puedan
    // compartir el mismo cupo.
    const [[cupo]] = await withCaptureToken(token, sql`
        update identity_capture_sessions
           set intentos      = intentos + 1,
               first_used_at = coalesce(first_used_at, now()),
               usable_until  = coalesce(usable_until, now() + interval '15 minutes'),
               device_hash   = coalesce(device_hash, ${deviceHash}),
               ip_primera    = coalesce(ip_primera, ${reqIp(request)}),
               ip_ultima     = ${reqIp(request)},
               user_agent    = coalesce(user_agent, ${(request.headers.get('user-agent') || '').slice(0, 400)})
         where token_hash = ${tokenHash} and intentos < ${MAX_INTENTOS}
        returning intentos`);
    if (!cupo) {
        await withCaptureToken(token,
            sql`update identity_capture_sessions set status = 'bloqueada' where token_hash = ${tokenHash}`);
        return new Response(JSON.stringify({
            error: 'Se agotaron los intentos de este enlace. Genera uno nuevo desde tu computadora.',
        }), { status: 429, headers: { 'Content-Type': 'application/json' } });
    }

    if (cookieNueva) {
        cookies.set(COOKIE_DISPOSITIVO, deviceCookie, {
            httpOnly: true,
            secure: import.meta.env.PROD,
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60,
        });
    }
    // ── Sólo una sesión CERRADA rechaza ────────────────────────────────────
    //
    // Antes bastaba `status === 'completed'` para responder 409, y `completed` se
    // ponía en cuanto llegaba el frente. Resultado: el REVERSO era inalcanzable
    // desde el teléfono, y lo necesitan la INE, el DNI, la CNH, el
    // Personalausweis, la CNI y las licencias de EE.UU. y Canadá — siete de los
    // ocho mercados. El proveedor respondía `verification_document_missing_back`
    // sin que nadie entendiera por qué.
    //
    // Ahora "ya cubrimos el mínimo" y "esta sesión terminó" son estados
    // DISTINTOS: `min_cubierto` sigue aceptando el reverso y el comprobante de
    // domicilio; sólo `cerrada` y `bloqueada` rechazan.
    if (SESION_TERMINADA.has(String(row.status))) {
        return new Response(JSON.stringify({ error: 'already_completed' }), { status: 409 });
    }

    const formData = await request.formData();
    const part = formData.get('part') as string;

    // El teléfono cierra la sesión explícitamente al terminar. Sin esto la sesión
    // sólo la cerraría el TTL, y el escritorio —que sondea cada 2.5 s— se quedaría
    // esperando aunque el usuario ya hubiera acabado.
    if (formData.get('action') === 'cerrar') {
        await withCaptureToken(token, sql`
            update identity_capture_sessions
               set status = 'cerrada', closed_at = now()
             where token_hash = ${tokenHash}`);
        return new Response(JSON.stringify({ ok: true, status: 'cerrada', captured: row.captured || {} }), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    }

    const file = formData.get('file');
    if (!(file instanceof File)) return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 });
    // ── `selfie` ya no existe, y su ausencia es el arreglo ──────────────────
    //
    // La selfie se subía a `verification.additional_document`, que el proveedor
    // documenta como un SEGUNDO documento de identidad o un comprobante de
    // domicilio ("a passport, local ID card, or utility bill"). No es una prueba
    // de vida: poner ahí una selfie mandaba el dato equivocado al campo
    // equivocado y, peor, ocupaba el hueco que el proveedor necesita cuando de
    // verdad pide un segundo documento — dejando a la cuenta sin forma de
    // satisfacer ese requisito.
    //
    // La prueba de vida real es un producto aparte del proveedor (sesiones de
    // verificación con `require_matching_selfie`), con costo por verificación;
    // está documentada como la ruta correcta y pendiente de decisión de negocio.
    // Mientras tanto, `address` cubre el uso REAL de ese campo.
    if (!['front', 'back', 'address'].includes(part)) {
        return new Response(JSON.stringify({ error: 'Invalid part' }), { status: 400 });
    }

    try {
        const guarded = await guardUpload(file, {
            maxBytes: 10 * 1024 * 1024,
            allowedMimes: ['image/jpeg', 'image/png'],
            prefix: part === 'address' ? 'address' : 'identity',
            // El frente y el reverso son el documento de identidad: ahí sí se
            // exige color y resolución legible. El comprobante de domicilio no.
            requireImage: part !== 'address',
        });
        // ── El mismo archivo no se manda dos veces ──────────────────────────
        //
        // El proveedor auto-rechaza un reenvío idéntico, así que subir otra vez
        // los mismos bytes —o el frente como si fuera el reverso— quema un
        // intento y devuelve un rechazo incomprensible. Se compara contra lo ya
        // subido EN ESTA SESIÓN; son digests, no imágenes, y mueren con la fila.
        const hashesPrevios = (row.hashes || {}) as Record<string, string>;
        const yaSubido = Object.entries(hashesPrevios).find(([, h]) => h === guarded.sha256);
        if (yaSubido) {
            const mismaParte = yaSubido[0] === part;
            return new Response(JSON.stringify({
                error: mismaParte
                    ? 'Esa foto ya la recibimos. Si el documento fue rechazado, toma una foto NUEVA — reenviar la misma vuelve a fallar.'
                    : 'Esa es la misma foto que subiste antes. Cada lado del documento necesita su propia foto.',
            }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        }

        const stripeAccountId = row.stripe_account_id as string;

        // La cuenta se retrieve-ea en vivo (no se confía en la columna local
        // stripe_business_type, que puede estar desactualizada) solo cuando el
        // doc va a nivel cuenta — y se reutiliza para el refresh de requisitos
        // de abajo en vez de pedirla dos veces.
        //
        // Se pide ANTES de subir el archivo, no después, porque de ella depende
        // el `purpose` del upload: el documento de una EMPRESA va con
        // `additional_verification` y el de una persona con `identity_document`.
        // Subir primero y decidir el destino después producía el mismatch que
        // dejaba el documento constitutivo imposible de adjuntar.
        let account: any = null;
        if (row.is_company_doc) account = await retrieveAccount(stripeAccountId);
        const destinoEsEmpresa = !!row.is_company_doc && account?.business_type !== 'individual';
        const purpose = (part === 'address' || destinoEsEmpresa)
            ? 'additional_verification'
            : 'identity_document';
        const uploaded = await stripeUpload(guarded.bytes, guarded.filename, guarded.mime, purpose, stripeAccountId);

        try {
            if (row.is_company_doc) {
                const prefix = destinoEsEmpresa ? 'company' : 'individual';
                const field = part === 'address'
                    ? `${prefix}[verification][additional_document][front]`
                    : `${prefix}[verification][document][${part}]`;
                await updateConnectAccount(stripeAccountId, { [field]: uploaded.id });
            } else if (part === 'address') {
                await attachPersonAdditionalDocument(stripeAccountId, row.person_id as string, uploaded.id);
            } else {
                await attachPersonDocument(stripeAccountId, row.person_id as string, uploaded.id, part as 'front' | 'back');
            }
        } catch (attachErr: any) {
            if (!isAlreadyVerifiedError(attachErr?.message || '')) throw attachErr;
            // Ya estaba verificado en Stripe — no había nada que actualizar, se
            // acepta esta parte como completada de todas formas.
        }

        // Merge atómico en la BD (no read-modify-write en JS) — evita perder una
        // parte si dos subidas llegaran casi al mismo tiempo.
        const [[merged]] = await withCaptureToken(token, sql`
            update identity_capture_sessions
            set captured = captured || jsonb_build_object(${part}::text, true),
                hashes   = hashes   || jsonb_build_object(${part}::text, ${guarded.sha256}::text)
            where token_hash = ${tokenHash}
            returning captured
        `);
        const captured = merged.captured as { front?: boolean; back?: boolean; address?: boolean };
        // `min_cubierto` = ya llegó el frente, que es el mínimo con el que el
        // proveedor puede empezar a verificar. NO cierra la sesión: el reverso es
        // obligatorio en casi todos los documentos de este set, y el comprobante
        // de domicilio se pide a veces. La sesión la cierra el teléfono cuando
        // termina, o el TTL.
        const status = captured.front ? 'min_cubierto' : 'en_progreso';
        await withCaptureToken(token,
            sql`update identity_capture_sessions set status = ${status} where token_hash = ${tokenHash}`,
        );

        const finalAccount = account || await retrieveAccount(stripeAccountId);
        await withOrgTx(row.org_id as string, sql`update orgs set stripe_requirements = ${JSON.stringify(sanitizeStripeRequirements(finalAccount.requirements))} where id = ${row.org_id}`);
        // Sin el file id: es un handle recuperable a la foto de la identificación
        // del usuario, y `audit_log` no se borra.
        // `actor` explícito: el POST público no tiene sesión, así que la
        // auditoría caía a 'system' y nada enlazaba quién PIDIÓ el enlace con
        // quién subió la foto. `created_by` cierra esa cadena.
        // Constancia de lo que Cord transmitió. Las métricas llegan del cliente
        // como NÚMEROS —nitidez, exposición, dimensiones—, nunca como píxeles, y
        // el veredicto del proveedor se escribe después en esta misma fila desde
        // el webhook. Ese par es lo que permite calibrar los umbrales de captura
        // con evidencia real en vez de con una corazonada.
        await registrarEnvioKyc({
            orgId: row.org_id as string,
            stripeAccountId,
            personaId: (row.persona_id as string) || null,
            stripePersonId: (row.person_id as string) || null,
            alcance: row.is_company_doc ? (destinoEsEmpresa ? 'company' : 'individual') : 'persona',
            parte: part,
            proposito: purpose,
            tipoDocumento: (formData.get('tipoDocumento') as string) || (row.doc_hint as string) || null,
            sha256: guarded.sha256,
            bytes: guarded.bytes.length,
            mime: guarded.mime,
            ancho: guarded.ancho,
            alto: guarded.alto,
            metricas: metricasDelCliente(formData.get('metricas')),
            origen: 'captura_movil',
            captureSessionId: (row.id as string) || null,
            emitidoPor: (row.created_by as string) || null,
            subidoPor: null,
            ip: reqIp(request),
            userAgent: request.headers.get('user-agent'),
        });

        await auditConnect(row.org_id as string, request, 'captura_movil_recibida', {
            entity: 'connect_document',
            entityId: (row.person_id as string) || stripeAccountId,
            detail: `${part}:${purpose}:${guarded.ancho}x${guarded.alto}`,
            actor: (row.created_by as string) || undefined,
        });

        return new Response(JSON.stringify({ ok: true, captured, status }), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
    } catch (e: any) {
        // Un fallo cuenta: seis seguidos son alguien probando, no alguien con
        // mala luz. Se bloquea la sesión, no la cuenta.
        const [[tras]] = await withCaptureToken(token, sql`
            update identity_capture_sessions
               set intentos_fallidos = intentos_fallidos + 1
             where token_hash = ${tokenHash}
            returning intentos_fallidos`);
        if (Number(tras?.intentos_fallidos ?? 0) >= MAX_FALLIDOS) {
            await withCaptureToken(token,
                sql`update identity_capture_sessions set status = 'bloqueada' where token_hash = ${tokenHash}`);
        }
        return new Response(JSON.stringify({ error: translateStripeError(e) || 'No se pudo subir el documento.' }), { status: 400 });
    }
};
