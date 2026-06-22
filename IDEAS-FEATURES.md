3# Cord — Análisis de nuevos features

Documento de exploración (jun 2026). NO es plan de implementación, es análisis
estratégico para decidir hacia dónde crece el producto. Ordenado por impacto/esfuerzo.

Contexto: Cord ya resuelve el **loop de cotizar → enviar → aprobar → cobrar →
facturar**. La pregunta es qué lo convierte en una herramienta que el negocio
B2B mexicano *no puede soltar*. La tesis de este doc: pasar de **"cotizar rápido"**
a **"cotizar bien y rentable"** con datos estructurados detrás (costeo, pricing,
proveedores) — sin volverse un ERP pesado y sin perder el alma simple de Cord.

Piezas que YA existen y sirven de cimiento:
- `productos.costo` + `cotizacion_items.costo_unitario` (snapshot de costo)
- Auditor Silencioso de márgenes (`orgs.aprob_margen_min`)
- IA `ai-draft` (arma cotización desde texto, empareja catálogo)
- FX lock + buffer cambiario (margen protegido en insumos importados)
- Historial real por cliente (CFO: tasa de cierre, días a pago, concentración)
- Niveles de precio por cliente (`clientes.nivel`/`descuento_pct`)

---

## 1. Motor de costeo por cédulas (BOM) + IA  ★ la idea de André

**Qué es:** el costo de un producto manufacturado/maquilado NO es un número fijo;
es **materia prima (receta/BOM) + mano de obra + overhead**. Hoy las distribuidoras
y manufactureras mexicanas calculan esto en Excel. Cord lo estructura y lo conecta
a la cotización.

**Por qué importa:** es el feature MÁS diferenciador. Convierte el `productos.costo`
estático en un costo *vivo* y *auditable*. Cuando sube el acero, recotizas todo tu
catálogo en un click. El Auditor de márgenes pasa de "validar un número que tú
escribiste" a "validar un número que el sistema calculó de verdad".

**Riesgo:** puede volverse mini-ERP y matar la simplicidad. Mitigación: **opt-in y
progresivo** — un producto simple sigue teniendo costo plano; solo los que quieras
llevan receta.

**Fases:**
- **F1 — Receta/BOM básica.** Tabla nueva `producto_componentes` (insumo + cantidad +
  merma %). El costo se *calcula* desde insumos. Recálculo masivo del catálogo.
- **F2 — IA de costeo.** "Necesito 200 piezas de X con acabado Y" → la IA arma la
  receta, calcula MP + producción, aplica margen objetivo, devuelve precio sugerido
  **con desglose auditable** (extiende `ai-draft`).
- **F3 — Cédulas de proveedores** (ver feature #3) alimentan el costo de MP con el
  precio más reciente/mejor.

**Esfuerzo:** Alto. **Impacto:** Muy alto. **Encaja con:** Auditor de márgenes, FX
lock, `ai-draft`, soluciones/manufactura y /distribuidoras.

---

## 2. Inteligencia de pricing (precio sugerido por IA)

**Qué es:** Cord ya tiene el dato más valioso que casi nadie usa: el **historial de
qué precio/descuento realmente cerró con cada cliente**. Un motor que sugiere el
precio óptimo: "a este cliente, productos de esta familia cierran al 8% de descuento;
ofrecer menos baja tu win-rate, ofrecer más regalas margen".

**Por qué importa:** ataca el dolor #1 del vendedor B2B — *"¿cuánto descuento doy sin
quemar margen ni perder la venta?"*. Es puro software sobre datos que YA tienes
(`eventos`, `cotizaciones`, `cotizacion_items`), sin capturar nada nuevo.

**Mecánica:** win-rate por banda de descuento × cliente/nivel/familia de producto +
días-a-cierre. Mostrar en el editor `/nueva` un chip "Precio sugerido: $X (cierra 72%)"
junto al chip de margen que ya existe.

**Esfuerzo:** Medio. **Impacto:** Alto. **Encaja con:** CFO, niveles de precio,
Auditor de márgenes, editor.

---

## 3. Capa de proveedores / compras (cédulas de insumos)

**Qué es:** registro de insumos por proveedor con **precio + vigencia + moneda**.
La cédula de MP (#1) siempre usa el costo vigente más reciente o el mejor proveedor.
Alertas: "el insumo Acero subió 14% → 23 cotizaciones vivas quedaron bajo margen".

**Por qué importa:** cierra el círculo del costeo y abre el lado *compras* del negocio
(hoy Cord solo ve el lado *ventas*). Con FX lock ya integrado, un insumo en USD +
buffer = margen protegido de verdad.

**Mecánica:** tablas `proveedores` + `insumo_precios` (insumo, proveedor, precio,
moneda, vigencia). Comparativo de proveedores. Enganche con el cron de alertas que ya
existe para mandar el aviso de alza por correo/Slack.

**Esfuerzo:** Medio-Alto. **Impacto:** Alto (sobre todo combinado con #1).
**Encaja con:** costeo BOM, FX, Slack, alertas.

---

## 4. Catálogo y cotización por variantes/configurador

**Qué es:** muchos productos B2B se cotizan por **configuración** (medida, material,
acabado, color) que cambian precio. Un configurador donde eliges atributos y el precio
se arma solo (estilo "build your own").

**Por qué importa:** elimina el "déjame lo checo y te aviso" — el vendedor cotiza
configuraciones complejas en vivo. Muy fuerte para manufactura/construcción.

**Esfuerzo:** Medio. **Impacto:** Medio-Alto. **Encaja con:** editor, BOM (#1).

---

## 5. Portal de recompra / autoservicio del cliente

**Qué es:** el link público `/q` hoy es de una cotización. Evolucionarlo a un **portal
del cliente** donde el comprador recurrente ve su historial, **recotiza/reordena** lo
de antes y pide nuevo sin esperar al vendedor.

**Por qué importa:** convierte cotizaciones en **recurrencia**. El dato de recompra
también alimenta el forecast del CFO. Es retención pura.

**Esfuerzo:** Medio. **Impacto:** Alto (LTV). **Encaja con:** `/q`, QuoteCard, CFO,
multi-tenant.

---

## 6. Cotización inteligente desde documento (OCR/parse)

**Qué es:** el cliente manda una **orden de compra / requisición en PDF o Excel**.
Cord la lee y arma la cotización emparejando contra catálogo (extiende `ai-draft` de
texto → a documentos).

**Por qué importa:** el input real del vendedor B2B casi nunca es texto limpio; es un
PDF de compras o un Excel. Quitar ese paso manual es magia percibida.

**Esfuerzo:** Medio (ya tienes el SDK de Anthropic y el matcher de catálogo).
**Impacto:** Alto. **Encaja con:** `ai-draft`, productos.

---

## 7. Plantillas de cotización por industria / kits

**Qué es:** paquetes pre-armados ("Kit de obra negra", "Línea de producción tipo A")
que el vendedor inserta como bloque en vez de línea por línea.

**Por qué importa:** velocidad para quien cotiza lo mismo seguido. Bajo esfuerzo,
construye sobre el editor existente.

**Esfuerzo:** Bajo. **Impacto:** Medio. **Encaja con:** editor, soluciones por industria.

---

## 8. App / experiencia móvil para el vendedor en campo

**Qué es:** el vendedor de construcción/distribución vive en la calle. Cotizar desde
el celular, foto del producto, captura rápida. Hoy la app es responsive pero no está
pensada *mobile-first* para cotizar.

**Por qué importa:** el momento de la venta B2B pasa en obra/bodega, no en escritorio.

**Esfuerzo:** Medio-Alto. **Impacto:** Medio-Alto. **Encaja con:** AppLayout, editor.

---

## Recomendación de secuencia

1. **#2 Inteligencia de pricing** primero — máximo impacto por esfuerzo, 100% sobre
   datos que ya tienes, valida la tesis "cotizar rentable" sin construir tablas nuevas
   grandes.
2. **#1 Costeo BOM (F1)** — el diferenciador de fondo, empezando por la receta básica.
3. **#3 Proveedores** — desbloquea el valor completo de #1 (costo vivo + alertas).
4. **#6 OCR de documentos** y **#5 Portal de recompra** como aceleradores de adopción
   en paralelo.

El hilo conductor: Cord deja de ser "la app que manda el link bonito" y se vuelve
**el cerebro de pricing y rentabilidad** del negocio B2B. Ahí no hay quién lo suelte.
