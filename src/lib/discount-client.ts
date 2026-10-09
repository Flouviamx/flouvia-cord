// Estado y comportamiento del control de descuento (<DiscountControl>) en los
// editores. Un constructor único para los tres editores: si cada uno armara su
// propio payload, tarde o temprano uno mandaría el importe en vez de la
// definición, o se olvidaría de quitar el cupón.
//
// Lo que sale de aquí:
//   - `engine()`  → la opción `descuento` del motor, para el resumen en vivo;
//   - `payload()` → `{ descuento, cupon }` para el body (siempre las DOS
//                   llaves: así el servidor distingue "sin descuento" de "no
//                   lo toqué"); nunca un importe;
//   - `render(t)` → pinta el renglón "Descuento (CÓDIGO) −X" con el importe
//                   que calculó el motor.
import type { DescuentoInput } from '../../packages/elements/src/engine';
import { CODIGO_CUPON_RE, etiquetaDescuento, type TipoDescuento } from './descuentos';

interface Aplicado {
    tipo: TipoDescuento;
    valor: number;
    /** Presente si salió de un cupón validado. */
    codigo?: string;
}

export interface DiscountControlOptions {
    /** Divisa del documento en este momento (el editor puede cambiarla). */
    getCurrency: () => string;
    getClienteId: () => string | null;
    /** El documento que se edita, para que un cupón ya usado por él no cuente doble. */
    getDocumento?: () => { cotizacion_id?: string | null; documento_id?: string | null };
    /** Formateador de dinero vigente (cambia con la divisa). */
    fmt: () => (n: number) => string;
    /** Se llama cada vez que cambia el descuento: el editor recalcula. */
    onChange: () => void;
}

export interface DiscountControl {
    engine(): DescuentoInput | null;
    payload(): { descuento: { tipo: TipoDescuento; valor: number } | null; cupon: string | null };
    render(descuentoTotal: number): void;
    /** Vuelve a validar el cupón (cambió la divisa o el cliente). */
    revalidate(): Promise<void>;
}

export function wireDiscountControl(root: HTMLElement | null, opts: DiscountControlOptions): DiscountControl {
    const nulo: DiscountControl = {
        engine: () => null,
        payload: () => ({ descuento: null, cupon: null }),
        render: () => {},
        revalidate: async () => {},
    };
    if (!root) return nulo;

    const T: Record<string, string> = (() => { try { return JSON.parse(root.dataset.i18n || '{}'); } catch { return {}; } })();
    const locale = root.dataset.locale || 'es';
    const q = <E extends HTMLElement>(sel: string) => root.querySelector(sel) as E;
    const row = q<HTMLElement>('[data-dsc-row]');
    const label = q<HTMLElement>('[data-dsc-label]');
    const amount = q<HTMLElement>('[data-dsc-amount]');
    const openBtn = q<HTMLButtonElement>('[data-dsc-open]');
    const panel = q<HTMLElement>('[data-dsc-panel]');
    const valueIn = q<HTMLInputElement>('[data-dsc-value]');
    const codeIn = q<HTMLInputElement>('[data-dsc-code]');
    const unit = q<HTMLElement>('[data-dsc-unit]');
    const apply = q<HTMLButtonElement>('[data-dsc-apply]');
    const msg = q<HTMLElement>('[data-dsc-msg]');
    const modes = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-dsc-mode]'));

    let aplicado: Aplicado | null = (() => {
        try {
            const v = JSON.parse(root.dataset.initial || 'null');
            if (!v || (v.tipo !== 'porcentaje' && v.tipo !== 'monto') || !(Number(v.valor) > 0)) return null;
            return { tipo: v.tipo, valor: Number(v.valor), ...(v.codigo ? { codigo: String(v.codigo) } : {}) };
        } catch { return null; }
    })();
    let modo: TipoDescuento | 'cupon' = aplicado?.codigo ? 'cupon' : (aplicado?.tipo ?? 'porcentaje');
    let ultimoTotal = 0;

    const mensaje = (texto: string | null) => {
        msg.textContent = texto || '';
        msg.hidden = !texto;
    };

    const pintarModo = () => {
        for (const b of modes) b.setAttribute('aria-checked', String(b.dataset.dscMode === modo));
        const esCupon = modo === 'cupon';
        valueIn.hidden = esCupon;
        codeIn.hidden = !esCupon;
        unit.textContent = modo === 'porcentaje' ? '%' : modo === 'monto' ? opts.getCurrency() : '';
        valueIn.max = modo === 'porcentaje' ? '100' : '';
    };

    const pintar = () => {
        const hay = !!aplicado && ultimoTotal > 0;
        row.hidden = !aplicado;
        openBtn.hidden = !!aplicado || !panel.hidden;
        label.textContent = etiquetaDescuento(aplicado, locale);
        amount.textContent = hay ? `−${opts.fmt()(ultimoTotal)}` : opts.fmt()(0);
    };

    const fijar = (nuevo: Aplicado | null) => {
        aplicado = nuevo;
        if (nuevo) panel.hidden = true;
        openBtn.setAttribute('aria-expanded', String(!panel.hidden));
        pintar();
        opts.onChange();
    };

    const validarCupon = async (codigo: string): Promise<Aplicado | null> => {
        const doc = opts.getDocumento?.() ?? {};
        const res = await fetch('/api/cupones/validar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo, moneda: opts.getCurrency(), cliente_id: opts.getClienteId(), ...doc }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
            mensaje(T[String(d.code || '')] || d.error || T.errorRed);
            return null;
        }
        return { tipo: d.cupon.tipo, valor: Number(d.cupon.valor), codigo: d.cupon.codigo };
    };

    openBtn.addEventListener('click', () => {
        panel.hidden = false;
        openBtn.setAttribute('aria-expanded', 'true');
        pintarModo();
        mensaje(null);
        pintar();
        (modo === 'cupon' ? codeIn : valueIn).focus();
    });

    for (const b of modes) {
        b.addEventListener('click', () => {
            modo = b.dataset.dscMode as TipoDescuento | 'cupon';
            mensaje(null);
            pintarModo();
            (modo === 'cupon' ? codeIn : valueIn).focus();
        });
    }

    codeIn.addEventListener('input', () => {
        codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    });

    const aplicar = async () => {
        mensaje(null);
        if (modo === 'cupon') {
            const codigo = codeIn.value.trim().toUpperCase();
            if (!CODIGO_CUPON_RE.test(codigo)) { mensaje(T.codigoInvalido); codeIn.focus(); return; }
            apply.disabled = true;
            const texto = apply.textContent;
            apply.textContent = T.validando || texto;
            try {
                const cupon = await validarCupon(codigo);
                if (cupon) fijar(cupon);
            } catch {
                mensaje(T.errorRed);
            } finally {
                apply.disabled = false;
                apply.textContent = texto;
            }
            return;
        }
        const valor = Number(valueIn.value);
        if (!Number.isFinite(valor) || valor <= 0) { mensaje(T.valorInvalido); valueIn.focus(); return; }
        if (modo === 'porcentaje' && valor > 100) { mensaje(T.pctInvalido); valueIn.focus(); return; }
        fijar({ tipo: modo, valor });
    };
    apply.addEventListener('click', aplicar);
    // Enter confirma el descuento, no el formulario del documento.
    for (const input of [valueIn, codeIn]) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); void aplicar(); }
        });
    }

    q<HTMLButtonElement>('[data-dsc-remove]').addEventListener('click', () => {
        valueIn.value = '';
        codeIn.value = '';
        fijar(null);
        openBtn.focus();
    });

    pintarModo();
    pintar();

    return {
        engine: () => (aplicado ? { tipo: aplicado.tipo, valor: aplicado.valor } : null),
        payload: () => (aplicado?.codigo
            ? { descuento: null, cupon: aplicado.codigo }
            : { descuento: aplicado ? { tipo: aplicado.tipo, valor: aplicado.valor } : null, cupon: null }),
        render(descuentoTotal: number) {
            ultimoTotal = Number(descuentoTotal) || 0;
            pintar();
        },
        async revalidate() {
            pintarModo();
            if (!aplicado?.codigo) return;
            try {
                const cupon = await validarCupon(aplicado.codigo);
                if (!cupon) {
                    // El motivo ya quedó en el mensaje: el cupón ya no aplica a
                    // este documento (otra divisa, otro cliente) y se quita.
                    panel.hidden = false;
                    fijar(null);
                    panel.hidden = false;
                    openBtn.hidden = true;
                }
            } catch { /* sin red: el servidor lo vuelve a validar al guardar */ }
        },
    };
}
