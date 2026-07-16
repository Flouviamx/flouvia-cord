// Clases CSS ESTABLES de los componentes nativos (CordBuilder y sus slots) +
// el resolver de `appearance.elements` (patrón Clerk). Cada nodo interno
// SIEMPRE lleva su clase `.cord-<key>` — nunca inline styles — así el host
// (Tailwind, CSS Modules, lo que sea) puede targetear con selectores CSS
// normales, algo que los inline styles de antes hacían imposible.
import type * as React from 'react';

export type CordElementKey =
    | 'builderRoot'
    | 'sectionTitle'
    | 'formField'
    | 'formFieldGrid'
    | 'formFieldLabel'
    | 'formFieldInput'
    | 'formFieldSelect'
    | 'formFieldTextarea'
    | 'itemsHeader'
    | 'itemsHeaderActions'
    | 'addItemButton'
    | 'ivaToggleLabel'
    | 'ivaToggleTrack'
    | 'ivaToggleThumb'
    | 'itemRow'
    | 'itemDescriptionField'
    | 'itemDescriptionInput'
    | 'itemQtyField'
    | 'itemPriceField'
    | 'itemRemoveButton'
    | 'productDropdown'
    | 'productDropdownItem'
    | 'productDropdownEmpty'
    | 'summaryRoot'
    | 'summaryInner'
    | 'summaryRow'
    | 'summaryTotalRow'
    | 'submitRow'
    | 'submitButton'
    | 'errorText';

/**
 * Override de un elemento: un className extra (string), un objeto de estilos
 * inline (React.CSSProperties), o ambos ({ className, style }). La clase base
 * `.cord-<key>` SIEMPRE se conserva — un override nunca la reemplaza, solo
 * agrega encima (mismo modelo que `appearance.elements` de Clerk).
 */
export type CordElementOverride =
    | string
    | React.CSSProperties
    | { className?: string; style?: React.CSSProperties };

export type CordElements = Partial<Record<CordElementKey, CordElementOverride>>;

function isShapedOverride(v: object): v is { className?: string; style?: React.CSSProperties } {
    return 'className' in v || 'style' in v;
}

function cx(...parts: Array<string | undefined | false | null>): string {
    return parts.filter(Boolean).join(' ');
}

/**
 * Resuelve className/style para un nodo interno: `.cord-<key>` + el override
 * de `appearance.elements[key]` (si lo hay) + el className/style que el JSX
 * local del slot ya traía (ej. las props que el propio consumidor pasó al
 * compound component, `<CordBuilder.SubmitButton className="…">`).
 */
export function resolveElement(
    key: CordElementKey,
    elements: CordElements | undefined,
    localClassName?: string,
    localStyle?: React.CSSProperties,
): { className: string; style: React.CSSProperties | undefined } {
    const base = `cord-${key}`;
    const override = elements?.[key];

    if (typeof override === 'string') {
        return { className: cx(base, override, localClassName), style: localStyle };
    }
    if (override && typeof override === 'object') {
        if (isShapedOverride(override)) {
            return {
                className: cx(base, override.className, localClassName),
                style: { ...localStyle, ...override.style },
            };
        }
        return { className: cx(base, localClassName), style: { ...localStyle, ...(override as React.CSSProperties) } };
    }
    return { className: cx(base, localClassName), style: localStyle };
}
