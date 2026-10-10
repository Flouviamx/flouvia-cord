// Vista previa del sales tax de EE. UU. por dirección en los editores de
// cotizaciones y facturas (navegador). Constructor ÚNICO para los dos: si cada
// editor armara su propia llamada, el primero que olvidara mandar el descuento
// pediría un cálculo distinto del que el servidor reusa al guardar.
//
// El editor no decide ninguna tasa: pide un cálculo real al servidor
// (`/api/impuestos/us-calculo`), lo pinta con el MISMO motor y manda su id al
// guardar. El servidor lo reusa solo si coincide con lo que se guarda; si no,
// calcula el suyo. Mientras el cálculo no llega, el resumen dice "calculando"
// y no muestra un impuesto inventado (regla 22).
//
// Sin imports a propósito: lo cargan scripts bundleados de dos páginas.

export interface UsTaxBoot {
    /** El cálculo automático corre hoy para este negocio (preferencia + plan + configuración). */
    activo: boolean;
    /** Clientes en EE. UU. (o sin país, que heredan el del negocio). */
    clientesUs: string[];
    i18n: { calculando: string; noDisponible: string; auto: string };
}

export interface UsTaxLineaPreview {
    /** Tasa efectiva del cálculo (fracción). */
    tasa: number;
    impuesto: number;
    desglose: any;
}

type Estado = 'no_aplica' | 'calculando' | 'listo' | 'error';

export function createUsTaxPreview(opts: {
    boot: UsTaxBoot | null | undefined;
    getClienteId: () => string | null;
    /**
     * El documento que se edita, para el tope de cálculos por documento y día
     * del servidor: 'cotizacion:<id>' o 'documento:<id>'. Un documento nuevo
     * (null) usa una clave 'borrador:<id>' propia de esta sesión del editor.
     */
    getDocumento?: () => string | null;
    /** Lo que define el cálculo: currency, iva_incluido, items, descuento/cupon. */
    buildRequest: () => Record<string, unknown>;
    /** Se llama cuando llega (o falla) un cálculo: el editor recalcula. */
    onChange: () => void;
}) {
    const boot = opts.boot;
    let key = '';
    let resultado: { key: string; aplica: boolean; calculoId: string | null; lineas: UsTaxLineaPreview[] } | null = null;
    let fallo: { key: string; mensaje: string } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sesion = `borrador:${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : '00000000-0000-4000-8000-000000000000'.replace(/0/g, () => Math.floor(Math.random() * 16).toString(16))}`;
    const documento = () => opts.getDocumento?.() || sesion;

    const applies = () => {
        const cid = opts.getClienteId();
        return !!boot?.activo && !!cid && boot.clientesUs.includes(cid);
    };

    /**
     * Registra lo que hoy pide el documento y, si cambió, programa un cálculo.
     * Se llama al INICIO de cada recálculo del editor: así `estado()` ya
     * compara contra lo que se está viendo.
     */
    function schedule() {
        if (!applies()) { key = ''; return; }
        const req = { cliente_id: opts.getClienteId(), ...opts.buildRequest() };
        const k = JSON.stringify(req);
        if (k === key) return;
        key = k;
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
            try {
                const res = await fetch('/api/impuestos/us-calculo', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...req, us_tax_calculo_id: resultado?.calculoId ?? null, documento: documento() }),
                });
                const d = await res.json().catch(() => ({}));
                if (k !== key) return;
                if (!res.ok) {
                    fallo = { key: k, mensaje: String(d.error || boot?.i18n.noDisponible || '') };
                } else {
                    resultado = {
                        key: k, aplica: d.aplica === true, calculoId: d.calculo_id ?? null,
                        lineas: Array.isArray(d.lineas) ? d.lineas : [],
                    };
                    fallo = null;
                }
            } catch {
                if (k === key) fallo = { key: k, mensaje: String(boot?.i18n.noDisponible || '') };
            }
            if (k === key) opts.onChange();
        }, 600);
    }

    function estado(): Estado {
        if (!applies() || !key) return 'no_aplica';
        if (resultado?.key === key) return resultado.aplica ? 'listo' : 'no_aplica';
        if (fallo?.key === key) return 'error';
        return 'calculando';
    }

    return {
        applies,
        schedule,
        estado,
        /** Tasa de la línea `i` del cálculo vigente, o null si no hay. */
        rateFor(i: number): number | null {
            return estado() === 'listo' ? Number(resultado!.lineas[i]?.tasa ?? 0) : null;
        },
        desgloseFor(i: number): any {
            return estado() === 'listo' ? (resultado!.lineas[i]?.desglose ?? null) : null;
        },
        /** El id del cálculo de la vista previa, para que el servidor lo reuse. */
        calculoId(): string | null {
            return estado() === 'listo' ? resultado!.calculoId : null;
        },
        mensaje(): string {
            const e = estado();
            if (e === 'error') return fallo!.mensaje;
            if (e === 'calculando') return String(boot?.i18n.calculando || '');
            return '';
        },
        auto: () => String(boot?.i18n.auto || ''),
    };
}
