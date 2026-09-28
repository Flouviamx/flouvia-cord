// Llamadas a APIs de terceros con un contrato común: tiempo límite, y un motivo
// traducible en vez del texto crudo del proveedor (regla 14).

export type MotivoProveedor = 'auth' | 'permiso' | 'limite' | 'red' | 'proveedor';

export class ProveedorError extends Error {
    constructor(readonly motivo: MotivoProveedor, readonly detalle?: string) {
        super(motivo);
        this.name = 'ProveedorError';
    }
}

const TIMEOUT_MS = 15_000;

export async function apiJson(url: string, init: RequestInit & { token?: string } = {}): Promise<any> {
    const { token, headers, ...resto } = init;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
        res = await fetch(url, {
            ...resto,
            signal: ctrl.signal,
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(headers as Record<string, string> | undefined),
            },
        });
    } catch {
        throw new ProveedorError('red');
    } finally {
        clearTimeout(t);
    }

    if (!res.ok) {
        // El cuerpo del error se LEE y se conserva en `detalle`, que solo va al
        // log: sin él, un 500 de un proveedor es indistinguible de otro y se
        // acaba adivinando la causa en vez de leerla. Nunca llega al usuario,
        // que ve el mensaje traducido del motivo (regla 14).
        const cuerpo = await res.text().catch(() => '');
        let detalle = `${res.status}`;
        try {
            const j = JSON.parse(cuerpo);
            const e = j?.error ?? j;
            const codigo = e?.code ?? e?.error ?? '';
            const msg = typeof e?.message === 'string' ? e.message : (e?.message?.value ?? '');
            detalle = `${res.status} ${codigo} ${msg}`.trim().slice(0, 300);
        } catch {
            if (cuerpo) detalle = `${res.status} ${cuerpo.slice(0, 200)}`;
        }
        if (res.status === 401) throw new ProveedorError('auth', detalle);
        if (res.status === 403) throw new ProveedorError('permiso', detalle);
        if (res.status === 429 || res.status >= 500) throw new ProveedorError('limite', detalle);
        throw new ProveedorError('proveedor', detalle);
    }

    if (res.status === 204) return null;
    const texto = await res.text();
    if (!texto) return null;
    try {
        return JSON.parse(texto);
    } catch {
        throw new ProveedorError('proveedor', 'respuesta ilegible');
    }
}
