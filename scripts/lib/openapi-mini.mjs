// Validador mínimo de JSON Schema para las OpenAPI fijadas en
// scripts/fixtures/ (hoy la de Iopole). Cubre lo que esas especificaciones
// usan: $ref, type (con nullable), required, properties, additionalProperties,
// items, minItems/maxItems, enum, pattern, minLength/maxLength,
// minimum/maximum y allOf/anyOf/oneOf. Sin dependencias: lo usan
// `npm run security:fr-pa` y la Iopole simulada de test/fr-pa-db.test.ts.
//
// Devuelve la lista de errores ("ruta: motivo"); vacía = válido.

export function crearValidador(spec) {
    const resolver = (ref) => ref.replace(/^#\//, '').split('/').reduce((c, p) => c?.[p.replace(/~1/g, '/').replace(/~0/g, '~')], spec);
    const deref = (s) => { let n = 0; while (s && s.$ref && n++ < 32) s = resolver(s.$ref); return s; };

    function tipoDe(v) {
        if (v === null) return 'null';
        if (Array.isArray(v)) return 'array';
        if (Number.isInteger(v)) return 'integer';
        return typeof v;
    }

    function validar(schema, valor, ruta, errores) {
        const s = deref(schema);
        if (!s || typeof s !== 'object') return;
        if (s.allOf) for (const sub of s.allOf) validar(sub, valor, ruta, errores);
        if (s.anyOf || s.oneOf) {
            const opciones = s.anyOf ?? s.oneOf;
            const validas = opciones.filter((sub) => { const e = []; validar(sub, valor, ruta, e); return e.length === 0; });
            if (!validas.length) errores.push(`${ruta}: no cumple ninguna de las ${opciones.length} opciones`);
            else if (s.oneOf && validas.length > 1 && !s.anyOf) { /* oneOf ambiguo: la especificación lo tolera */ }
        }
        if (valor === null) {
            if (s.nullable || s.type === 'null' || (Array.isArray(s.type) && s.type.includes('null'))) return;
            if (s.type) errores.push(`${ruta}: null no permitido`);
            return;
        }
        if (s.type) {
            const t = tipoDe(valor);
            const ok = s.type === t || (s.type === 'number' && t === 'integer') || (Array.isArray(s.type) && (s.type.includes(t) || (t === 'integer' && s.type.includes('number'))));
            if (!ok) { errores.push(`${ruta}: se esperaba ${s.type}, llegó ${t}`); return; }
        }
        if (s.enum && !s.enum.some((e) => e === valor || String(e) === String(valor))) errores.push(`${ruta}: "${valor}" fuera de la lista (${s.enum.slice(0, 8).join('|')}${s.enum.length > 8 ? '|…' : ''})`);
        if (typeof valor === 'string') {
            if (s.pattern && !new RegExp(s.pattern).test(valor)) errores.push(`${ruta}: "${valor.slice(0, 60)}" no cumple /${s.pattern}/`);
            if (s.maxLength !== undefined && valor.length > s.maxLength) errores.push(`${ruta}: más de ${s.maxLength} caracteres`);
            if (s.minLength !== undefined && valor.length < s.minLength) errores.push(`${ruta}: menos de ${s.minLength} caracteres`);
        }
        if (typeof valor === 'number') {
            if (s.minimum !== undefined && valor < s.minimum) errores.push(`${ruta}: menor que ${s.minimum}`);
            if (s.maximum !== undefined && valor > s.maximum) errores.push(`${ruta}: mayor que ${s.maximum}`);
        }
        if (Array.isArray(valor)) {
            if (s.minItems !== undefined && valor.length < s.minItems) errores.push(`${ruta}: menos de ${s.minItems} elementos`);
            if (s.maxItems !== undefined && valor.length > s.maxItems) errores.push(`${ruta}: más de ${s.maxItems} elementos`);
            if (s.items) valor.forEach((x, i) => validar(s.items, x, `${ruta}[${i}]`, errores));
        }
        if (tipoDe(valor) === 'object') {
            const props = s.properties ?? {};
            for (const r of s.required ?? []) if (valor[r] === undefined) errores.push(`${ruta}.${r}: obligatorio`);
            for (const [k, v] of Object.entries(valor)) {
                if (props[k]) validar(props[k], v, `${ruta}.${k}`, errores);
                else if (s.additionalProperties === false) errores.push(`${ruta}.${k}: campo no declarado`);
                else if (s.additionalProperties && typeof s.additionalProperties === 'object') validar(s.additionalProperties, v, `${ruta}.${k}`, errores);
            }
        }
    }

    /** El esquema del cuerpo JSON de una operación. */
    function esquemaCuerpo(metodo, ruta, tipo = 'application/json') {
        const op = spec.paths?.[ruta]?.[metodo.toLowerCase()];
        if (!op) return null;
        const rb = deref(op.requestBody);
        return rb?.content?.[tipo]?.schema ?? null;
    }

    /** El esquema de una respuesta. */
    function esquemaRespuesta(metodo, ruta, codigo, tipo = 'application/json') {
        const op = spec.paths?.[ruta]?.[metodo.toLowerCase()];
        const r = deref(op?.responses?.[String(codigo)]);
        return r?.content?.[tipo]?.schema ?? null;
    }

    /** ¿Existe el campo `a.b[].c` en el esquema? */
    function tieneCampo(schema, camino) {
        let actual = [deref(schema)];
        for (const parte of camino.split('.')) {
            const esArray = parte.endsWith('[]');
            const nombre = esArray ? parte.slice(0, -2) : parte;
            const siguiente = [];
            for (const s0 of actual) {
                const candidatos = [s0, ...(s0?.allOf ?? []), ...(s0?.anyOf ?? []), ...(s0?.oneOf ?? [])].map(deref);
                for (const c of candidatos) {
                    let p = nombre === '' ? c : deref(c?.properties?.[nombre]);
                    if (!p) continue;
                    if (esArray) p = deref(p.items);
                    if (p) siguiente.push(p);
                }
            }
            if (!siguiente.length) return false;
            actual = siguiente;
        }
        return true;
    }

    return {
        validar: (schema, valor, ruta = '$') => { const e = []; validar(schema, valor, ruta, e); return e; },
        esquemaCuerpo,
        esquemaRespuesta,
        tieneCampo,
        deref,
        operacion: (metodo, ruta) => spec.paths?.[ruta]?.[metodo.toLowerCase()] ?? null,
    };
}
