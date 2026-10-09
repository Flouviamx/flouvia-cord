// Adaptador de Iopole al puerto de transmisión (proveedor.ts).
//
// Autenticación (documentación "Authentication" y `securitySchemes` de la
// OpenAPI): OAuth 2.0 client_credentials contra el realm `iopole` de su
// Keycloak; el token dura una hora y se pide de nuevo al vencer. Cabecera
// opcional `customer-id` cuando la cuenta de operador gestiona varios
// clientes.
//
// Clasificación de errores, que decide qué hace la cola:
//   red, tiempo agotado, 5xx       → TransmisionSinRespuestaError (incierto:
//                                    no se sabe si se procesó; se CONSULTA)
//   401, 403, 429                  → TransmisionPeticionRechazadaError (nada
//                                    se procesó; la organización se pausa)
//   otro 4xx (validación, conflicto) → TransmisionRechazoError (final, a la
//                                    vista con su motivo)
// El mensaje crudo del proveedor queda en el log y en `respuesta`; la pantalla
// solo dice qué pasó (regla 14).

import { HOSTS_IOPOLE, NOMBRE_PLATAFORMA, type ConfigPa } from '../config';
import {
    TransmisionPeticionRechazadaError, TransmisionRechazoError, TransmisionSinRespuestaError,
    type AltaConsultada, type AltaCreada, type ArchivoFactura, type CobroFactura, type EntornoPa, type EstadoFactura,
    type FacturaEncontrada, type ProveedorTransmision, type Recibido, type ReporteFactura, type ReportePagoFactura,
    type ReportePagoTransacciones, type ReporteTransacciones, type SolicitudAlta,
} from '../proveedor';
import {
    ESQUEMA_SIREN, consultaFacturas, cuerpoAlta, cuerpoCobro, cuerpoPagoFactura, cuerpoPagoTransacciones, cuerpoReporteFactura,
    cuerpoTransacciones, leerAlta, leerEstado, ruta,
} from './cuerpos';

type Fetch = typeof fetch;

export interface OpcionesIopole {
    entorno: EntornoPa;
    clientId: string;
    clientSecret: string;
    customerId?: string | null;
    /** Para pruebas: un fetch simulado. */
    fetchImpl?: Fetch;
    /** Tiempo máximo de cada petición. */
    timeoutMs?: number;
}

interface Token { valor: string; vence: number }
const tokens = new Map<string, Token>();

/** Mensaje legible de un cuerpo de error de Iopole (`message`, `statusMessage`, `details.message`). */
function mensajeDe(json: any, status: number): string {
    const partes = [json?.message, json?.statusMessage, json?.details?.message, json?.error_description, json?.error]
        .map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
    return (partes[0] ?? `HTTP ${status}`).slice(0, 500);
}

export class IopoleCliente implements ProveedorTransmision {
    readonly id = 'iopole' as const;
    readonly nombre = NOMBRE_PLATAFORMA;
    readonly entorno: EntornoPa;
    private readonly fetchImpl: Fetch;
    private readonly timeoutMs: number;

    constructor(private readonly o: OpcionesIopole) {
        this.entorno = o.entorno;
        this.fetchImpl = o.fetchImpl ?? fetch;
        this.timeoutMs = o.timeoutMs ?? 25_000;
    }

    static desdeConfig(c: ConfigPa, fetchImpl?: Fetch): IopoleCliente | null {
        if (!c.habilitado || !c.clientId || !c.clientSecret) return null;
        return new IopoleCliente({ entorno: c.entorno, clientId: c.clientId, clientSecret: c.clientSecret, customerId: c.customerId, fetchImpl });
    }

    private get hosts() { return HOSTS_IOPOLE[this.entorno]; }

    private async token(): Promise<string> {
        const clave = `${this.entorno}|${this.o.clientId}`;
        const t = tokens.get(clave);
        if (t && t.vence > Date.now() + 60_000) return t.valor;
        let res: Response;
        try {
            res = await this.fetchImpl(this.hosts.token, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
                body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.o.clientId, client_secret: this.o.clientSecret }).toString(),
                signal: AbortSignal.timeout(this.timeoutMs),
            });
        } catch (error) {
            // Sin token no salió ninguna petición de negocio: nada se procesó.
            throw new TransmisionPeticionRechazadaError(`No se pudo obtener el token de la plataforma: ${error instanceof Error ? error.message : String(error)}`);
        }
        const json: any = await res.json().catch(() => null);
        if (!res.ok || !json?.access_token) throw new TransmisionPeticionRechazadaError(`La plataforma rechazó las credenciales (${mensajeDe(json, res.status)}).`, res.status);
        const segundos = Number(json.expires_in) > 0 ? Number(json.expires_in) : 3600;
        tokens.set(clave, { valor: String(json.access_token), vence: Date.now() + segundos * 1000 });
        return String(json.access_token);
    }

    /** Una petición autenticada. Devuelve el JSON de la respuesta (o null si vino vacía). */
    private async pedir(metodo: 'GET' | 'POST', path: string, cuerpo?: { json?: unknown; form?: FormData }, query?: Record<string, string | number>, admite404 = false): Promise<any> {
        const url = new URL(path, this.hosts.api);
        for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
        const headers: Record<string, string> = { Authorization: `Bearer ${await this.token()}`, Accept: 'application/json' };
        if (this.o.customerId) headers['customer-id'] = this.o.customerId;
        if (cuerpo?.json !== undefined) headers['Content-Type'] = 'application/json';
        let res: Response;
        try {
            res = await this.fetchImpl(url.toString(), {
                method: metodo,
                headers,
                body: cuerpo?.json !== undefined ? JSON.stringify(cuerpo.json) : cuerpo?.form,
                signal: AbortSignal.timeout(this.timeoutMs),
            });
        } catch (error) {
            throw new TransmisionSinRespuestaError(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
        }
        const texto = await res.text().catch(() => '');
        let json: any = null;
        if (texto) { try { json = JSON.parse(texto); } catch { json = null; } }
        if (res.ok) {
            if (texto && json === null) throw new TransmisionSinRespuestaError(`Respuesta ilegible de la plataforma (HTTP ${res.status}).`);
            return json;
        }
        if (res.status === 404 && admite404) return null;
        if (res.status === 401) tokens.delete(`${this.entorno}|${this.o.clientId}`);
        if (res.status === 401 || res.status === 403 || res.status === 429) throw new TransmisionPeticionRechazadaError(mensajeDe(json, res.status), res.status);
        if (res.status >= 500 || res.status === 408) throw new TransmisionSinRespuestaError(`HTTP ${res.status}: ${mensajeDe(json, res.status)}`);
        throw new TransmisionRechazoError(mensajeDe(json, res.status), json?.details?.code ?? json?.code ?? String(res.status), json);
    }

    private recibido(json: any): Recibido {
        if (!json?.id) throw new TransmisionSinRespuestaError('La plataforma aceptó la petición sin devolver su identificador.');
        return { id: String(json.id) };
    }

    // ── Alta ──

    async crearAlta(s: SolicitudAlta): Promise<AltaCreada> {
        const json = await this.pedir('POST', ruta('crearAlta'), { json: cuerpoAlta(s) });
        if (!json?.enrollmentId || !json?.onboardingUrl) throw new TransmisionSinRespuestaError('La plataforma creó el alta sin devolver su identificador.');
        return { altaId: String(json.enrollmentId), enlace: String(json.onboardingUrl) };
    }

    async consultarAlta(altaId: string): Promise<AltaConsultada | null> {
        return leerAlta(await this.pedir('GET', ruta('consultarAlta', { enrollmentId: altaId }), undefined, undefined, true));
    }

    async buscarAltaEnCurso(siren: string): Promise<AltaCreada | null> {
        const json = await this.pedir('GET', ruta('altaPorIdentificador', { scheme: ESQUEMA_SIREN, identifier: siren }), undefined, undefined, true);
        return json?.enrollmentId && json?.onboardingUrl ? { altaId: String(json.enrollmentId), enlace: String(json.onboardingUrl) } : null;
    }

    async buscarEntidad(siren: string): Promise<string | null> {
        // El directorio interno del operador, paginado (límite 200, desplazamiento
        // hasta 1000 según la OpenAPI). Se compara en la respuesta, que sí
        // documenta `identifierScheme`/`identifierValue`.
        for (let offset = 0; offset <= 1000; offset += 200) {
            const json = await this.pedir('GET', ruta('entidades'), undefined, { offset, limit: 200 });
            const data: any[] = Array.isArray(json?.data) ? json.data : [];
            const e = data.find((x) => (x?.identifierScheme === ESQUEMA_SIREN && x?.identifierValue === siren)
                || (x?.type === 'LEGAL_UNIT' && x?.countryIdentifier?.siren === siren));
            if (e?.businessEntityId) return String(e.businessEntityId);
            if (data.length < 200) return null;
        }
        return null;
    }

    // ── Factura ──

    async enviarFactura(archivo: ArchivoFactura): Promise<Recibido> {
        const form = new FormData();
        form.append('file', new Blob([archivo.contenido as BlobPart], { type: archivo.tipo }), archivo.nombre);
        return this.recibido(await this.pedir('POST', ruta('enviarFactura'), { form }));
    }

    async buscarFactura(q: { siren: string; numero: string; desde: string }): Promise<FacturaEncontrada | null> {
        const json = await this.pedir('GET', ruta('buscarFacturas'), undefined, {
            q: consultaFacturas(q.siren, q.desde), expand: 'businessData', limit: 200, offset: 0,
        });
        const data: any[] = Array.isArray(json?.data) ? json.data : [];
        const f = data.find((x) => x?.metadata?.direction === 'OUTBOUND' && String(x?.businessData?.invoiceId ?? '') === q.numero);
        return f?.metadata?.invoiceId ? { id: String(f.metadata.invoiceId) } : null;
    }

    async estadosFactura(facturaId: string): Promise<EstadoFactura[]> {
        const json = await this.pedir('GET', ruta('historialEstados', { invoiceId: facturaId }));
        return (Array.isArray(json) ? json : []).map(leerEstado).filter((x): x is EstadoFactura => !!x);
    }

    async enviarCobro(facturaId: string, cobro: CobroFactura): Promise<Recibido> {
        return this.recibido(await this.pedir('POST', ruta('enviarEstado', { invoiceId: facturaId }), { json: cuerpoCobro(cobro) }));
    }

    // ── E-reporting ──

    private sirenParams(siren: string) { return { identifierScheme: ESQUEMA_SIREN, identifierValue: siren }; }

    async reportarFactura(siren: string, r: ReporteFactura): Promise<Recibido> {
        return this.recibido(await this.pedir('POST', ruta('reporteFactura', this.sirenParams(siren)), { json: cuerpoReporteFactura(r) }));
    }

    async reportarTransacciones(siren: string, r: ReporteTransacciones): Promise<Recibido> {
        return this.recibido(await this.pedir('POST', ruta('reporteTransacciones', this.sirenParams(siren)), { json: cuerpoTransacciones(r) }));
    }

    async reportarPagoFactura(siren: string, r: ReportePagoFactura): Promise<Recibido> {
        return this.recibido(await this.pedir('POST', ruta('reportePagoFactura', this.sirenParams(siren)), { json: cuerpoPagoFactura(r) }));
    }

    async reportarPagoTransacciones(siren: string, r: ReportePagoTransacciones): Promise<Recibido> {
        return this.recibido(await this.pedir('POST', ruta('reportePagoTransacciones', this.sirenParams(siren)), { json: cuerpoPagoTransacciones(r) }));
    }
}

/** Para pruebas: olvida los tokens en memoria. */
export function olvidarTokens(): void {
    tokens.clear();
}
