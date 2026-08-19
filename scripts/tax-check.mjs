// Contrato de impuestos por línea y retenciones. Corre en `npm run test:payments`.
//
// Cubre tres formas concretas en que Cord mostraba o guardaba un número
// equivocado antes de agosto 2026:
//
//   1. `quoteIva`/`quoteTotal` calculaban con la constante `IVA = 0.16` sin
//      importar la organización, mientras la etiqueta sí decía la tasa real. El
//      link público de un negocio en Madrid decía "IVA 21%" junto a un importe
//      que era el 16% del subtotal — y ese es el número que lee el cliente.
//   2. El catálogo `impuestos` existía por org y el editor de cotizaciones lo
//      ignoraba: leía la columna plana `orgs.iva_pct`. "IVA 8% frontera" y
//      "Exento" se podían configurar y no cambiaban nada.
//   3. `orgs.retencion_iva_pct` / `retencion_isr_pct` se capturaban, se
//      guardaban y no los leía nadie.
//
// A diferencia de los tests unitarios, este script mira también la FUENTE: que
// las constantes muertas no vuelvan a colarse en las superficies de dinero.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    calculateDocumentTotals,
    calculateInvoiceTotals,
} from '../packages/elements/src/engine.ts';
import {
    TAX_PRESETS,
    getCountryProfile,
    taxKindLabel,
    taxPresetsFor,
} from '../src/lib/countries.ts';
import { buildTaxOptions, defaultTaxRate } from '../src/lib/impuestos.ts';

const linea = (cantidad, precio, tax_rate) => ({
    descripcion: 'x', cantidad, precio_unitario: precio, tax_rate,
});

// ── 1. Dos tasas en un documento no se aplanan a un promedio ────────────────
{
    const r = calculateInvoiceTotals([linea(1, 1000, 0.16), linea(1, 1000, 0)]);
    assert.equal(r.subtotal, 2000);
    assert.equal(r.impuestos, 160, 'aplanar a 8% sobre 2000 daría 160 por accidente; verificar el desglose');
    assert.equal(r.porTasa.length, 2, 'el desglose debe declarar las dos tasas por separado');
}

// ── 2. Precio impuesto-incluido: cada línea se desagrega con SU tasa ────────
{
    const r = calculateInvoiceTotals(
        [linea(1, 1160, 0.16), linea(1, 500, 0)],
        { ivaIncluido: true },
    );
    assert.ok(Math.abs(r.subtotal - 1500) < 1e-9, 'base incorrecta al desagregar con tasas distintas');
    assert.ok(Math.abs(r.impuestos - 160) < 1e-9);
}

// ── 3. Una retención RESTA ─────────────────────────────────────────────────
{
    const r = calculateDocumentTotals([linea(1, 1000, 0.16)], {
        retenciones: [{ nombre: 'Retención IVA', tipo: 'ret_iva', tasa: 0.106667 }],
    });
    assert.ok(r.total < r.subtotal + r.impuestos, 'la retención se está SUMANDO al total');
    assert.ok(Math.abs(r.retencionTotal - 106.667) < 0.001);
    // En México la retención de IVA es 2/3 del IVA del 16%: se calcula sobre el
    // subtotal, no sobre el total con impuesto.
    assert.ok(Math.abs(r.retenciones[0].monto - (160 * 2 / 3)) < 0.01);
}

// ── 4. Una tasa fuera de rango falla fuerte, no calcula mal en silencio ─────
for (const mala of [16, -0.1, Number.NaN, Infinity]) {
    assert.throws(() => calculateInvoiceTotals([linea(1, 100, mala)]), RangeError,
        `tax_rate=${mala} debió lanzar`);
}
assert.throws(() => calculateDocumentTotals([linea(1, 100, 0)], {
    retenciones: [{ nombre: 'mal', tasa: 10.667 }],
}), RangeError, 'una retención en porcentaje debió lanzar');

// ── 5. El constructor de opciones siempre ofrece exento ────────────────────
{
    const vacio = buildTaxOptions([], { locale: 'es', countryCode: 'ES' });
    assert.ok(vacio.some((o) => o.rate === 0), 'sin catálogo debe quedar al menos "Exento"');

    const cat = [
        { id: 'a', nombre: 'IVA 21%', kind: 'consumo', tipo: 'iva', kindLabel: 'IVA', tasa: 21, rate: 0.21, esDefault: true, activo: true },
        { id: 'b', nombre: 'Ret. IVA', kind: 'retencion', tipo: 'ret_iva', kindLabel: 'Retención', tasa: 15, rate: 0.15, esDefault: true, activo: true },
    ];
    const opts = buildTaxOptions(cat, { locale: 'es', countryCode: 'ES' });
    assert.ok(!opts.some((o) => o.kind === 'retencion'),
        'una retención no se elige por línea: no debe aparecer en el selector');
    assert.ok(opts.some((o) => o.rate === 0), 'falta la opción exenta');
    assert.equal(defaultTaxRate(cat), 0.21);
    // Orden ascendente: el exento primero, como se lee cualquier factura.
    assert.deepEqual([...opts].sort((a, b) => a.rate - b.rate).map((o) => o.rate), opts.map((o) => o.rate));
}

// ── 6. Vocabulario del país, no mexicano por defecto ───────────────────────
assert.equal(taxKindLabel('consumo', 'es', 'MX'), 'IVA');
assert.equal(taxKindLabel('consumo', 'en', 'GB'), 'VAT');
assert.equal(taxKindLabel('consumo', 'en', 'AU'), 'GST');
assert.equal(taxKindLabel('consumo', 'en', 'US'), 'Sales tax');
assert.equal(getCountryProfile('ES').taxIdLabel, 'NIF / CIF');
assert.equal(getCountryProfile('MX').taxIdLabel, 'RFC');

// ── 7. Los presets son coherentes ──────────────────────────────────────────
for (const [code, presets] of Object.entries(TAX_PRESETS)) {
    const defaults = presets.filter((p) => p.esDefault);
    assert.equal(defaults.length, 1, `${code}: debe haber exactamente un default`);
    assert.equal(defaults[0].kind, 'consumo', `${code}: el default debe ser de consumo`);
    assert.ok(presets.some((p) => p.tasa === 0), `${code}: falta una tasa 0`);
    for (const p of presets) {
        assert.ok(p.tasa >= 0 && p.tasa <= 100, `${code}/${p.nombre}: tasa fuera de rango`);
    }
}
// Sales tax por jurisdicción / ICMS estatal: no se inventa una tasa nacional.
for (const code of ['US', 'BR']) {
    assert.equal(taxPresetsFor(code).length, 1, `${code} no debe traer tasas inventadas`);
    assert.equal(taxPresetsFor(code)[0].tasa, 0);
}

// ── 8. La constante muerta no vuelve a las superficies de dinero ────────────
// `IVA = 0.16` sigue exportada por compatibilidad, pero ninguna superficie que
// el cliente lee puede volver a calcular con ella.
{
    const mock = readFileSync(new URL('../src/lib/mock.ts', import.meta.url), 'utf8');
    for (const fn of ['quoteSubtotal', 'quoteIva', 'quoteTotal']) {
        const linea = mock.split('\n').find((l) => l.includes(`export const ${fn} =`));
        assert.ok(linea, `no se encontró ${fn} en mock.ts`);
        assert.ok(!/\bIVA\b/.test(linea), `${fn} volvió a calcular con la constante IVA`);
    }
    assert.ok(mock.includes('calculateDocumentTotals'),
        'mock.ts debe calcular los totales con el motor compartido');
}
// El editor de cotizaciones no puede volver a leer una tasa plana del DOM.
{
    const editor = readFileSync(new URL('../src/pages/app/cotizaciones/nueva.astro', import.meta.url), 'utf8');
    assert.ok(!editor.includes('cfgIva'),
        'el editor volvió a leer una tasa plana (#cfgIva) en vez del catálogo');
    assert.ok(editor.includes('calculateDocumentTotals'),
        'el editor debe calcular con el motor compartido, no con su propia copia');
}

console.log('security:tax OK');
