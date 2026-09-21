// src/lib/db-fetch.ts
// Reintento del `fetch` con el que el driver HTTP de Neon habla con la base.
//
// Un corte de red de medio segundo —cambio de wifi, el Mac despertando, un DNS
// que tarda— tumbaba la página entera con "Error connecting to database:
// TypeError: fetch failed", aunque la base estuviera sana.
//
// Lo que NO se puede hacer es reintentar cualquier "fetch failed". Si la
// petición llegó a Neon, se ejecutó y lo que se perdió fue la RESPUESTA,
// repetirla ejecuta la transacción dos veces: un pago registrado dos veces, un
// correo mandado dos veces. Así que solo se reintentan los fallos de la fase de
// CONEXIÓN, donde está garantizado que la petición nunca salió de la máquina.
// Un reset a mitad de camino (`ECONNRESET`, `UND_ERR_SOCKET`) es ambiguo y NO
// se reintenta: ahí es mejor fallar que duplicar.

const CONNECT_PHASE = new Set([
    'ENOTFOUND',              // DNS no resolvió
    'EAI_AGAIN',              // DNS temporalmente no disponible
    'ECONNREFUSED',           // nadie escuchando en el puerto
    'ENETUNREACH',            // sin ruta de red
    'EHOSTUNREACH',           // host inalcanzable
    'UND_ERR_CONNECT_TIMEOUT' // el socket nunca se abrió
]);

const MAX_REINTENTOS = 2;

/** ¿El error garantiza que la petición NO llegó al servidor? */
export function isConnectPhaseError(err: unknown): boolean {
    const causa = (err as { cause?: { code?: string } } | null)?.cause;
    return !!causa?.code && CONNECT_PHASE.has(causa.code);
}

type FetchLike = (input: any, init?: any) => Promise<Response>;

/** Envuelve un fetch para reintentar solo lo que es seguro reintentar. */
export function withConnectRetry(base: FetchLike, espera = (ms: number) => new Promise((r) => setTimeout(r, ms))): FetchLike {
    return async (input, init) => {
        for (let intento = 0; ; intento++) {
            try {
                return await base(input, init);
            } catch (err) {
                if (intento >= MAX_REINTENTOS || !isConnectPhaseError(err)) throw err;
                await espera(150 * (intento + 1));
            }
        }
    };
}
