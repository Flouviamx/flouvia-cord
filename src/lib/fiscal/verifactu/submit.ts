// Envío asíncrono a la AEAT de los registros Verifactu ya encadenados — el
// outbox de Verifactu, mismo patrón que el outbox de consumo de Stripe
// (billing-reconcile.ts): el registro se genera y encadena de forma SÍNCRONA
// al emitir (SpainVerifactuProvider), y el ENVÍO va aparte para no bloquear la
// emisión de la factura con la latencia o la disponibilidad de la AEAT.
//
// Quién llama aquí:
//   - el propio proveedor, justo después de encadenar (`after()`): la remisión
//     es "inmediata" en la medida en que el control de flujo lo permite;
//   - /api/cron/verifactu-submit, cada hora, para lo que no salió entonces.
//
// Garantías de esta versión (antes no existían):
//   - Un solo envío en vuelo por organización (lease en verifactu_envio_estado):
//     el cron horario, el de respaldo y el envío tras emitir no duplican lotes.
//   - Control de flujo de la Orden (art. 16.2): se respeta el TiempoEsperaEnvio
//     que devuelve la AEAT, salvo con 1000 registros acumulados.
//   - Un registro que rompe el esquema no bloquea la cola: se detecta antes de
//     mandarlo, o se aísla partiendo el lote tras un SoapFault, y se APARCA
//     (`bloqueado`) para corregirlo con una subsanación.
//   - El ObligadoEmision de la cabecera sale del propio registro (antes salía
//     de `orgs.rfc`, vacío en organizaciones fuera de México: su NIF vive en
//     fiscal_metadata.tax_id).
import { randomUUID } from 'node:crypto';
import { sql, withOrgTx, withSystemTx } from '../../db';
import { after } from '../../after';
import { decryptSecret } from '../../crypto-secret';
import { log } from '../../log';
import { submitToAeat, type RegistroIdentity, type RespuestaEnvio } from './aeat';
import { logVerifactuEvento } from './chain';
import { credencialesTls, InvalidCertificateError } from './cert';
import {
    clasificarFallo, identidadDeRegistro, loteTrasFallo, primerGrupo, resolverRespuesta, segundosDeEspera,
    type FilaPendiente,
} from './envio';
import { problemasEsquemaAlta, problemasEsquemaAnulacion } from './registro';
import { verifactuEnvioConfig } from './sif';

/** Máximo de envíos por organización en una sola llamada (cinturón contra bucles). */
const MAX_ENVIOS_POR_LLAMADA = 25;
/** Margen para no empezar un envío que no alcanza a terminar antes del plazo. */
const MARGEN_ENVIO_MS = 12_000;
/** Espera tras un fallo de cabecera/certificado: no tiene sentido insistir cada minuto. */
const ESPERA_FALLO_CABECERA_S = 15 * 60;
/**
 * Sin otro registro con qué contrastarlo, un registro que hace fallar el
 * mensaje solo se aparca tras este número de intentos (cada ejecución horaria
 * suma uno): antes de eso puede ser un fallo general pasajero.
 */
const INTENTOS_PARA_APARCAR_SOLO = 6;

export interface SubmitOrgResult {
    orgId: string;
    enviados: number;
    aceptados: number;
    aceptadosConErrores: number;
    rechazados: number;
    bloqueados: number;
    sinRespuesta: number;
    /** Quedan registros pendientes al terminar (para la segunda pasada del cron). */
    quedanPendientes: boolean;
    /** No se intentó: envío apagado, otra llamada en curso o esperando el control de flujo. */
    omitido?: string;
    error?: string;
}

export interface SubmitOptions {
    /** Instante (ms) a partir del cual no se empieza otro envío. */
    deadline?: number;
    /** Esperar el TiempoEsperaEnvio dentro de esta llamada si el plazo lo permite. */
    permitirEspera?: boolean;
}

const vacio = (orgId: string): SubmitOrgResult => ({
    orgId, enviados: 0, aceptados: 0, aceptadosConErrores: 0, rechazados: 0, bloqueados: 0, sinRespuesta: 0, quedanPendientes: false,
});

const dormir = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Dos fallos aislables son el mismo si traen el mismo código (o ninguno de los dos trae). */
const mismoFallo = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);

/**
 * Organizaciones españolas que pueden tener envíos pendientes. Barrido de
 * SISTEMA solo sobre `orgs` (cuya política acepta el carril de sistema): el
 * trabajo de cada una vuelve a `withOrgTx` dentro de `submitPendingForOrg`.
 */
export async function orgsConVerifactuActivo(): Promise<string[]> {
    const [rows] = await withSystemTx(sql`
        select id from orgs
         where (verifactu_modo = 'verifactu' or verifactu_cert_enc is not null)
           and sandbox_of is null and is_demo is not true
         order by id`);
    return rows.map((r: any) => r.id as string);
}

async function contarPendientes(orgId: string): Promise<number> {
    const [rows] = await withOrgTx(orgId, sql`
        select count(*)::int as n from verifactu_registros
         where org_id = ${orgId} and envio_estado = 'pendiente'`);
    return Number(rows[0]?.n || 0);
}

/**
 * `esperaS` es el TiempoEsperaEnvio de la AEAT: fija el próximo envío y se
 * recuerda como la espera entre envíos. `pausaS` solo aplaza el próximo envío
 * de la organización (certificado, fallo de cabecera): antes se guardaba como
 * si fuera la espera de la AEAT y los envíos siguientes esperaban 15 minutos
 * entre lote y lote.
 */
async function actualizarEstado(orgId: string, campos: {
    esperaS?: number; pausaS?: number; lote?: number; error?: string | null; enviado?: boolean;
}): Promise<void> {
    const proximoS = campos.pausaS ?? campos.esperaS ?? null;
    await withOrgTx(orgId, sql`
        update verifactu_envio_estado
           set proximo_envio_at = case when ${proximoS}::int is null then proximo_envio_at
                                       else now() + make_interval(secs => ${proximoS ?? 0}::int) end,
               tiempo_espera_s = coalesce(${campos.esperaS ?? null}::int, tiempo_espera_s),
               lote_maximo = coalesce(${campos.lote ?? null}::int, lote_maximo),
               ultimo_error = case when ${campos.error === undefined} then ultimo_error else ${campos.error ?? null} end,
               ultimo_envio_at = case when ${campos.enviado === true} then now() else ultimo_envio_at end,
               updated_at = now()
         where org_id = ${orgId}`);
}

async function aparcar(orgId: string, fila: FilaPendiente, motivo: string, detalle: Record<string, unknown>): Promise<void> {
    await withOrgTx(orgId, sql`
        update verifactu_registros
           set envio_estado = 'bloqueado', envio_at = now(), envio_error = ${motivo.slice(0, 1000)},
               aeat_respuesta = ${JSON.stringify({ aparcado: true, motivo, ...detalle })}::jsonb
         where id = ${fila.id} and org_id = ${orgId} and envio_estado = 'pendiente'`);
    await logVerifactuEvento(orgId, 'incidencia', { motivo: 'registro aparcado', registro: fila.id, seq: fila.seq, detalle: motivo });
}

async function identidadPrevia(orgId: string, seq: number): Promise<RegistroIdentity | null> {
    if (seq <= 1) return null;
    const [rows] = await withOrgTx(orgId, sql`
        select tipo, payload from verifactu_registros
         where org_id = ${orgId} and seq = ${seq - 1} limit 1`);
    const prior = rows[0];
    return prior ? identidadDeRegistro(prior.tipo, prior.payload) : null;
}

/**
 * Envía el backlog pendiente de UNA org. Aislado por diseño: el fallo de una
 * org (certificado caducado, red caída) no puede tumbar el envío de las demás.
 * Nunca lanza por un fallo de la AEAT: lo devuelve en `error` y lo deja
 * anotado en verifactu_envio_estado.
 */
export async function submitPendingForOrg(orgId: string, options: SubmitOptions = {}): Promise<SubmitOrgResult> {
    const result = vacio(orgId);
    const config = verifactuEnvioConfig();
    if (!config.habilitado) {
        // Interruptor apagado: el backlog queda pendiente y no se toca la red.
        result.omitido = 'envio_deshabilitado';
        return result;
    }
    const deadline = options.deadline ?? Date.now() + 40_000;

    const [orgRows] = await withOrgTx(orgId, sql`
        select razon_social, nombre, verifactu_cert_enc, verifactu_cert_pass_enc, verifactu_cert_caduca,
               sandbox_of, is_demo
          from orgs where id = ${orgId} limit 1`);
    const org = orgRows[0];
    if (!org || org.sandbox_of || org.is_demo) {
        result.omitido = 'org_no_aplica';
        return result;
    }

    // Esperar el control de flujo dentro de esta llamada, si se pidió y cabe.
    if (options.permitirEspera) {
        const [estadoRows] = await withOrgTx(orgId, sql`
            select extract(epoch from (proximo_envio_at - now())) as faltan
              from verifactu_envio_estado where org_id = ${orgId} limit 1`);
        const faltanMs = Math.max(0, Number(estadoRows[0]?.faltan || 0) * 1000);
        if (faltanMs > 0 && Date.now() + faltanMs + MARGEN_ENVIO_MS < deadline) await dormir(faltanMs + 250);
    }

    // Lease: un solo envío en vuelo por organización. Solo se toma si hay
    // pendientes y ya pasó el tiempo de espera (o hay 1000 acumulados).
    const token = randomUUID();
    const leaseS = Math.max(60, Math.ceil((deadline - Date.now()) / 1000) + 60);
    const [, leaseRows] = await withOrgTx(orgId,
        sql`insert into verifactu_envio_estado (org_id) values (${orgId}) on conflict (org_id) do nothing`,
        sql`update verifactu_envio_estado e
               set lease_hasta = now() + make_interval(secs => ${leaseS}::int), lease_token = ${token}, updated_at = now()
             where e.org_id = ${orgId}
               and (e.lease_hasta is null or e.lease_hasta < now())
               and exists (select 1 from verifactu_registros r where r.org_id = ${orgId} and r.envio_estado = 'pendiente')
               and (e.proximo_envio_at is null or e.proximo_envio_at <= now()
                    or (select count(*) from verifactu_registros r
                         where r.org_id = ${orgId} and r.envio_estado = 'pendiente') >= 1000)
         returning lote_maximo, tiempo_espera_s`,
    );
    if (!leaseRows[0]) {
        result.omitido = 'sin_pendientes_en_espera_o_en_curso';
        result.quedanPendientes = (await contarPendientes(orgId)) > 0;
        return result;
    }
    let lote = Math.max(1, Math.min(1000, Number(leaseRows[0].lote_maximo) || 1000));
    let esperaS = Number(leaseRows[0].tiempo_espera_s) || 60;

    try {
        const p12b64 = decryptSecret(org.verifactu_cert_enc as string);
        const password = decryptSecret(org.verifactu_cert_pass_enc as string);
        if (!p12b64 || !password) {
            result.error = 'Certificado Verifactu no disponible (no se pudo descifrar o no está cargado).';
            await actualizarEstado(orgId, { error: result.error, pausaS: ESPERA_FALLO_CABECERA_S });
            return result;
        }
        // `verifactu_cert_caduca` es un día: el certificado vale TODO ese día.
        // Comparar contra la medianoche UTC lo daba por caducado desde las
        // 00:00 de su último día válido.
        const caduca = org.verifactu_cert_caduca instanceof Date
            ? org.verifactu_cert_caduca.toISOString().slice(0, 10)
            : String(org.verifactu_cert_caduca || '').slice(0, 10);
        if (caduca && caduca < new Date().toISOString().slice(0, 10)) {
            result.error = `El certificado Verifactu caducó el ${org.verifactu_cert_caduca}.`;
            await actualizarEstado(orgId, { error: result.error, pausaS: ESPERA_FALLO_CABECERA_S });
            await logVerifactuEvento(orgId, 'incidencia', { motivo: 'certificado caducado' });
            return result;
        }
        let credenciales;
        try {
            credenciales = credencialesTls(Buffer.from(p12b64, 'base64'), password);
        } catch (error) {
            result.error = error instanceof InvalidCertificateError ? error.message : 'El certificado Verifactu no se pudo cargar.';
            await actualizarEstado(orgId, { error: result.error, pausaS: ESPERA_FALLO_CABECERA_S });
            return result;
        }

        // Un registro que, SOLO, hace fallar el mensaje es SOSPECHOSO, no
        // culpable: el mismo fallo puede ser de todos (un cambio de esquema en la
        // AEAT, la identidad del software). Se marca (en `aeat_respuesta`, que
        // sobrevive entre ejecuciones), se aparta y se sigue con los demás.
        // - Si otro registro pasa, se vuelve a probar el sospechoso solo: si
        //   falla otra vez, ahora sí es suyo y se aparca.
        // - Si otro registro falla solo con el MISMO código, el fallo es
        //   sistemático: se quitan las marcas, se pausa la organización y no se
        //   aparca a nadie.
        // - Si no queda nadie con qué contrastar, se aparca tras
        //   INTENTOS_PARA_APARCAR_SOLO intentos.
        // Antes cada registro aislado se aparcaba de inmediato y un fallo
        // general dejaba la cola entera en `bloqueado`, que no tiene vuelta atrás.
        let huboExito = false;

        for (let envio = 0; envio < MAX_ENVIOS_POR_LLAMADA; envio++) {
            const [limpiosRows, sospechososRows] = await withOrgTx(orgId,
                sql`select id, tipo, seq, payload, envio_intentos from verifactu_registros
                     where org_id = ${orgId} and envio_estado = 'pendiente'
                       and coalesce(aeat_respuesta->>'sospechoso', '') <> 'true'
                     order by seq asc
                     limit ${lote}`,
                sql`select id, tipo, seq, payload, envio_intentos, aeat_respuesta from verifactu_registros
                     where org_id = ${orgId} and envio_estado = 'pendiente'
                       and aeat_respuesta->>'sospechoso' = 'true'
                     order by seq asc
                     limit 1`,
            );
            // Tras un envío que pasó, el sospechoso se contrasta YA; si no hay
            // limpios, también se reintenta (es lo único que queda).
            const probando = sospechososRows.length > 0 && (huboExito || !limpiosRows.length);
            const pendRows = probando ? sospechososRows : limpiosRows;
            const pendientes: FilaPendiente[] = pendRows.map((r) => ({
                id: String(r.id), tipo: r.tipo === 'anulacion' ? 'anulacion' : 'alta', seq: Number(r.seq), payload: r.payload,
            }));
            if (!pendientes.length) break;

            // 1) Lo que rompe el esquema no se manda: rechazaría el mensaje
            //    entero. Se aparca y se sigue con el resto.
            let aparcados = 0;
            for (const fila of pendientes) {
                const problemas = fila.tipo === 'alta' ? problemasEsquemaAlta(fila.payload) : problemasEsquemaAnulacion(fila.payload);
                if (problemas.length) {
                    await aparcar(orgId, fila, `No cumple el esquema de la AEAT: ${problemas.join('; ')}`, { problemas });
                    aparcados++;
                }
            }
            if (aparcados) {
                result.bloqueados += aparcados;
                continue;
            }

            if (deadline - Date.now() < MARGEN_ENVIO_MS) break;

            const grupo = primerGrupo(pendientes, await identidadPrevia(orgId, pendientes[0].seq), {
                max: lote,
                entornoPorDefecto: config.entorno,
                nombrePorDefecto: String(org.razon_social || org.nombre || ''),
            });
            if (!grupo) break;
            const ids = grupo.filas.map((f) => f.id);
            await withOrgTx(orgId, sql`
                update verifactu_registros set envio_intentos = envio_intentos + 1
                 where org_id = ${orgId} and id = any(${ids}::uuid[])`);

            let respuesta: RespuestaEnvio;
            try {
                respuesta = await submitToAeat(grupo.emisor, grupo.registros, {
                    entorno: grupo.entorno,
                    credenciales,
                    timeoutMs: Math.max(5_000, Math.min(30_000, deadline - Date.now() - 2_000)),
                });
            } catch (error) {
                const clase = clasificarFallo(error);
                const mensaje = error instanceof Error ? error.message : String(error);
                log.error('verifactu: fallo al enviar a la AEAT', { route: 'verifactu-submit', orgId, clase, registros: ids.length, err: error });
                if (clase === 'aislable' && grupo.filas.length > 1) {
                    // El culpable está en el lote: el siguiente envío lleva la
                    // mitad. Convergencia en log2(n) envíos sin aparcar a nadie
                    // por error.
                    lote = loteTrasFallo(grupo.filas.length);
                    await actualizarEstado(orgId, { lote, esperaS, error: mensaje, enviado: true });
                } else if (clase === 'aislable' && probando) {
                    // El sospechoso vuelve a fallar solo. Es suyo si otro envío
                    // pasó entretanto o si ya agotó sus intentos.
                    const fila = grupo.filas[0];
                    const intentos = (Number(sospechososRows[0]?.envio_intentos) || 0) + 1;
                    const detalle = { fault: (error as any)?.faultstring, codigo: (error as any)?.codigo };
                    // Contraste entre ejecuciones: ¿la AEAT procesó otro registro
                    // de esta organización después de marcarlo?
                    const marcadoAt = String((sospechososRows[0]?.aeat_respuesta as any)?.marcado_at || '');
                    let procesadoDespues = false;
                    if (!huboExito && marcadoAt) {
                        const [[r]] = await withOrgTx(orgId, sql`
                            select exists (select 1 from verifactu_registros
                                            where org_id = ${orgId} and id <> ${fila.id}
                                              and envio_estado in ('aceptado', 'aceptado_con_errores', 'rechazado')
                                              and envio_at > ${marcadoAt}::timestamptz) as hay`);
                        procesadoDespues = r?.hay === true;
                    }
                    if (huboExito || procesadoDespues || intentos >= INTENTOS_PARA_APARCAR_SOLO) {
                        await aparcar(orgId, fila, mensaje, detalle);
                        result.bloqueados++;
                        lote = 1000;
                        await actualizarEstado(orgId, { lote, esperaS, error: mensaje, enviado: true });
                    } else {
                        result.error = mensaje;
                        await actualizarEstado(orgId, { pausaS: ESPERA_FALLO_CABECERA_S, error: mensaje, enviado: true });
                        break;
                    }
                } else if (clase === 'aislable') {
                    const fila = grupo.filas[0];
                    const codigo = (error as any)?.codigo;
                    const marcado = sospechososRows[0]?.aeat_respuesta as Record<string, unknown> | undefined;
                    if (marcado && mismoFallo(marcado.codigo, codigo)) {
                        // Otro registro distinto falla solo con el MISMO fallo: no es
                        // de un registro. Se quitan las marcas, se pausa la
                        // organización como un fallo de cabecera y no se aparca a nadie.
                        await withOrgTx(orgId, sql`
                            update verifactu_registros set aeat_respuesta = null
                             where org_id = ${orgId} and envio_estado = 'pendiente' and aeat_respuesta->>'sospechoso' = 'true'`);
                        result.error = mensaje;
                        await actualizarEstado(orgId, { lote: 1000, pausaS: ESPERA_FALLO_CABECERA_S, error: mensaje, enviado: true });
                        await logVerifactuEvento(orgId, 'incidencia', { motivo: 'fallo sistemático del envío: ningún registro se aparcó', detalle: mensaje.slice(0, 500) });
                        break;
                    }
                    // Registro que falla solo: se marca sospechoso y se sigue con
                    // los demás en lotes completos.
                    await withOrgTx(orgId, sql`
                        update verifactu_registros
                           set envio_error = ${mensaje.slice(0, 1000)},
                               aeat_respuesta = ${JSON.stringify({ sospechoso: true, codigo: codigo ?? null, fault: (error as any)?.faultstring ?? null, marcado_at: new Date().toISOString() })}::jsonb
                         where id = ${fila.id} and org_id = ${orgId} and envio_estado = 'pendiente'`);
                    lote = 1000;
                    await actualizarEstado(orgId, { lote, esperaS, error: mensaje, enviado: true });
                } else {
                    result.error = mensaje;
                    await actualizarEstado(orgId, {
                        ...(clase === 'cabecera' ? { pausaS: ESPERA_FALLO_CABECERA_S } : { esperaS }),
                        error: mensaje,
                        enviado: true,
                    });
                    if (clase === 'cabecera') await logVerifactuEvento(orgId, 'incidencia', { motivo: 'envío rechazado por la AEAT', detalle: mensaje.slice(0, 500) });
                    break;
                }
                if (!options.permitirEspera || Date.now() + esperaS * 1000 + MARGEN_ENVIO_MS >= deadline) break;
                await dormir(esperaS * 1000);
                continue;
            }

            result.enviados += grupo.filas.length;
            huboExito = true;
            const resoluciones = resolverRespuesta(grupo, respuesta);
            const filas = resoluciones.map((r) => ({
                id: r.fila.id,
                estado: r.estado,
                error: r.estado === 'aceptado' ? null : (r.motivo ?? null),
                respuesta: { estadoEnvio: respuesta.estadoEnvio, csv: respuesta.csv ?? null, linea: r.linea, motivo: r.motivo ?? null },
            }));
            await withOrgTx(orgId, sql`
                update verifactu_registros r
                   set envio_estado = x.estado,
                       envio_at = case when x.estado = 'pendiente' then r.envio_at else now() end,
                       envio_error = x.error,
                       aeat_respuesta = x.respuesta
                  from jsonb_to_recordset(${JSON.stringify(filas)}::jsonb) as x(id uuid, estado text, error text, respuesta jsonb)
                 where r.id = x.id and r.org_id = ${orgId} and r.envio_estado = 'pendiente'`);
            for (const r of resoluciones) {
                if (r.estado === 'aceptado') result.aceptados++;
                else if (r.estado === 'aceptado_con_errores') result.aceptadosConErrores++;
                else if (r.estado === 'rechazado') result.rechazados++;
                else result.sinRespuesta++;
            }
            esperaS = segundosDeEspera(respuesta);
            lote = Math.min(1000, lote * 2);
            await actualizarEstado(orgId, { esperaS, lote, error: null, enviado: true });
            const incidencias = resoluciones.filter((r) => r.estado === 'rechazado' || r.estado === 'aceptado_con_errores');
            if (incidencias.length) {
                await logVerifactuEvento(orgId, 'incidencia', {
                    motivo: 'registros rechazados o aceptados con errores por la AEAT',
                    csv: respuesta.csv ?? null,
                    registros: incidencias.slice(0, 50).map((r) => ({
                        id: r.fila.id, seq: r.fila.seq, estado: r.estado, codigo: r.linea?.codigoError ?? null,
                        numSerie: identidadDeRegistro(r.fila.tipo, r.fila.payload).numSerieFactura,
                    })),
                });
            }

            // Control de flujo: con 1000 acumulados se puede seguir ya; si no,
            // hay que esperar TiempoEsperaEnvio desde este envío.
            const quedan = await contarPendientes(orgId);
            if (!quedan) break;
            if (quedan >= 1000) continue;
            if (!options.permitirEspera || Date.now() + esperaS * 1000 + MARGEN_ENVIO_MS >= deadline) break;
            await dormir(esperaS * 1000);
        }
    } finally {
        await withOrgTx(orgId, sql`
            update verifactu_envio_estado
               set lease_hasta = null, lease_token = null, updated_at = now()
             where org_id = ${orgId} and lease_token = ${token}`).catch((error) => {
            log.error('verifactu: no se pudo liberar el lease de envío', { route: 'verifactu-submit', orgId, err: error });
        });
    }
    result.quedanPendientes = (await contarPendientes(orgId)) > 0;
    return result;
}

/**
 * Intento de envío INMEDIATO tras encadenar (lo llama el proveedor al emitir o
 * anular): en segundo plano, sin añadir latencia a la emisión y sin esperar el
 * control de flujo — si la AEAT pidió esperar, lo recoge el cron horario.
 */
export function programarEnvioInmediato(orgId: string): void {
    after(submitPendingForOrg(orgId, { deadline: Date.now() + 40_000 })
        .catch((error) => log.error('verifactu: el envío inmediato falló', { route: 'fiscal/verifactu', orgId, err: error })));
}
