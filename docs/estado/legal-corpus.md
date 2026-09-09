# Corpus legal: publicación y trabajo editorial

Estado técnico de fase 5. El inventario **no acredita cumplimiento internacional**
ni sustituye revisión jurídica. La migración mecánica está terminada; la redacción
final, los anexos locales y las traducciones todavía no.

La fase 5.1 añade cuatro propuestas corregidas de términos/privacidad ES/EN en
`src/content/legal-revisions`, fuera del catálogo publicable. Su versión candidata
es `2026-08-30.1`, con vigencia y hash nulos. Cambios y evidencia en
[revisión general 2026-08-30](../historial/revisiones-legales/2026-08-30-general.md). Estas revisiones no
reemplazan los originales ni se suman como variantes nuevas del inventario.

La fase 5.2 convierte ocho extractos ES/EN de pagos, facturación, KYC y evidencia
de disputas en propuestas independientes `editorialStage: technical-draft`, aún
no publicables. Evidencia, decisiones y nuevos bloqueos fiscales en
[revisión de pagos 2026-08-30](../historial/revisiones-legales/2026-08-30-payments.md).

La fase 5.3 reescribe seis extractos ES/EN de cobranza, divulgación de IA y uso
aceptable sin activar políticas ni automatizaciones. La revisión descubrió tres
bloqueos técnicos de alto riesgo: atribución ambigua al aceptar cuotas, herramientas
MCP `[*]` sin confirmación por llamada y un canal de cese que hoy depende de
gestión manual. Evidencia y orden de corrección en
[revisión de automatización 2026-09-01](../historial/revisiones-legales/2026-09-01-automation.md).

La fase 5.4 completa la redacción técnica de las diez variantes ES/EN de DPA,
subencargados, cookies, retención y SLA. Ya no quedan extractos sin corregir entre
los 24 borradores existentes; todos siguen no publicables. La matriz documenta
contradicciones de KYC/borrado, export parcial, analítica server-side y límites de
las sondas diarias en
[revisión de gobierno de datos 2026-09-01](../historial/revisiones-legales/2026-09-01-data-governance.md).

## Inventario verificable

`src/lib/legal-corpus-plan.ts` define 27 documentos objetivo en tres idiomas:
81 variantes. Hoy existen **4 variantes publicadas y 24 borradores**. Las otras
**53 variantes no existen todavía**; no se generan archivos vacíos ni se usa inglés
como sustituto de portugués.

| Documento | ES / EN | PT-BR |
|---|---|---|
| `terms` | Texto completo publicado, versión 2026-08-11 | Pendiente |
| `privacy` | Texto completo publicado, versión 2026-08-29 | Pendiente |
| `payments-terms` | Redacción técnica ES/EN, revisión externa pendiente | Pendiente |
| `invoicing-terms` | Redacción técnica ES/EN, bloqueos fiscales abiertos | Pendiente |
| `kyc-aml-policy` | Redacción técnica ES/EN, revisión externa pendiente | Pendiente |
| `collections-notice` | Redacción técnica ES/EN, bloqueos de cese y atribución abiertos | Pendiente |
| `ai-disclosure` | Redacción técnica ES/EN, controles MCP/proveedor pendientes | Pendiente |
| `dispute-evidence-notice` | Redacción técnica ES/EN, revisión externa pendiente | Pendiente |
| `acceptable-use-policy` | Redacción técnica ES/EN, enforcement y apelación pendientes | Pendiente |
| `dpa` | Redacción técnica ES/EN, schedules y ejecución pendientes | Pendiente |
| `subprocessors` | Redacción técnica ES/EN, contratos/regiones/aviso pendientes | Pendiente |
| `cookies-policy` | Redacción técnica ES/EN, inventario desplegado y análisis pendientes | Pendiente |
| `retention-policy` | Redacción técnica ES/EN, conflictos de borrado abiertos | Pendiente |
| `sla` | Redacción técnica ES/EN; no existe SLA estándar medible | Pendiente |
| `us-state-privacy-annex` | Pendiente | Pendiente |
| `country-mx`, `country-us`, `country-ca`, `country-br` | Pendientes | Pendientes |
| `country-es`, `country-gb`, `country-de`, `country-fr` | Pendientes | Pendientes |
| `country-co`, `country-ar`, `country-cl`, `country-pe` | Pendientes | Pendientes |

Los 22 extractos iniciales y los dos DPA previos ya son **propuestas técnicas**:
24 borradores en total. Ninguno es un contrato aprobado y todavía faltan anexos,
datos verificados, traducciones y revisión externa.
Su frontmatter conserva `sourceSections` con documento, versión y ancla;
`dependsOn` y `releaseBlockers` organizan la revisión. Ninguno es un contrato
independiente aprobado. La fecha de trabajo no establece vigencia. Una ruta
declarada en un borrador es propuesta editorial, no ruta activa.

## Fuentes y preservación de evidencia

- Los cuatro cuerpos completos viven en `src/content/legal/{es-MX,en-US}/*.md`.
  Los archivos Astro ya no contienen el texto contractual bilingüe; conservan
  navbar, footer, estilos y comportamiento del índice/cookies.
- Estos cuatro documentos usan `sourceKind: html-snapshot`: HTML literal válido
  dentro de Markdown, legible por bloques, sin expresiones Astro ni MDX ejecutable.
  Se eligió este formato para conservar **exactamente** los bytes previamente
  asociados a una aceptación. Pasar ese cuerpo por un renderer Markdown/MDX
  ordinario cambiaría espacios, atributos o envoltorios y rompería las huellas.
- `legal-publication.ts` restaura exclusivamente los saltos entre tokens y el
  atributo de estilo Astro original, declarado en `legacyScope`. No normaliza
  texto ni ignora diferencias antes de calcular SHA-256. La salida se compara
  con el hash del bundle antes de renderizar; cualquier alteración falla cerrada.
- Las cuatro URLs, versiones, acciones y hashes siguen iguales. No se modifica
  `db/schema.sql`, no se reescriben aceptaciones y no se exige una aceptación nueva
  por esta extracción. Los punteros heredados al archivo Astro en la base siguen
  identificando la ruta de presentación, no la nueva fuente editorial.
- Se preservan todos los destinos del índice: 17 secciones de términos, 14 de
  privacidad y anclas adicionales como `#cord-pagos` y el control `#cc-reopen`.
- `sourceInputsSha256` vincula cada publicación con la identidad y, en privacidad,
  con las filas localizadas del inventario de proveedores. Cambiar esos datos
  detiene el build: hay que revisar y publicar otra versión, no mutar una aceptada.
  Los datos centrales siguen en `legal-identity.ts` y `legal-providers.ts`.
- No se creó una ruta comodín para documentos legales. Las páginas públicas
  exigen variante publicada **y** coincidencia exacta con el bundle permitido.
  Cambiar `draft` a `published` en un archivo no lo publica.

Los scripts de extracción son de **un solo uso** y rechazan sobreescribir fuentes
ya extraídas. No son comandos de publicación ni deben ejecutarse en CI.

## Orden de revisión pendiente

1. Confirmar identidad, domicilio, contacto y decisiones de ley/foro; corregir en
   una nueva versión los términos heredados que no describan el producto actual.
   La preservación mecánica no los convalida. Hay que revisar particularmente
   límites de planes, lenguaje de remisión Verifactu y fundamentos de retención.
2. Revisar externamente las propuestas de pagos/facturación/KYC/evidencia,
   cobranza/IA y uso aceptable contra los controles reales. Resolver atribución
   de participantes, orden de activación de cuotas, canal de cese y permisos MCP.
   Resolver los bloqueos CFDI/Verifactu documentados antes de prometer cobertura.
   El interés automático sigue deshabilitado; no se inventa una tasa por país.
   No sustituir la aceptación específica de tarifas de Cord Payments.
3. Revisar externamente DPA, subencargados, cookies, retención y SLA; resolver
   primero contradicción KYC/borrado, evidencia durable, export parcial, cookies
   desplegadas, contratos/regiones, transferencias y medidas reales.
4. Revisar cada anexo local contra el flujo realmente ofrecido. El catálogo de
   países no prueba exposición jurídica ni equivalencia de reglas. Distinguir
   cobro en línea de registro manual y documento comercial de remisión fiscal.
5. Preparar y revisar traducciones PT-BR después de estabilizar el texto fuente;
   mantener correspondencia de cláusulas y bloquear variantes incompletas.
6. Publicar mediante una decisión explícita: nueva versión, artefacto calculado,
   preservación de versiones anteriores, catálogo/base coherentes y acción de
   aceptación adecuada. No reemplazar hashes aceptados ni habilitar por accidente
   un anexo o un SLA aún pendiente de revisión.

El status conserva Vercel Hobby: sondeos diarios, frescura máxima de 26 horas y
sin métricas inventadas. Es evidencia técnica limitada, no un SLA ni fundamento
para prometer un porcentaje de uptime contractual.

## Verificación

```sh
npm run build
npm run security:legal
npm run typecheck
npm test
npm run security:css
npm run security:health
node --experimental-strip-types scripts/legal-editorial-check.mjs --json
```

`security:legal` comprueba artefactos, hojas de estilo enlazadas, inventario,
dependencias y procedencia, además de los bloqueos de identidad/proveedores y
el aislamiento de las propuestas en `legalRevisions`.
La colección y el check editorial comparten el guard de las 24 propuestas
complementarias; impiden activación, hash real o solicitud de aceptación, y
comprueban correspondencia estructural de secciones ES/EN.
`test/legal-publication.test.ts` prueba integridad, enlaces y rechazo de variantes
ausentes, borradores, idioma/ruta incorrectos, inyección y cambios sin versión.

`npm run security:legal-corpus-release` **debe fallar** mientras existan borradores
o variantes pendientes. Es distinto del gate de identidad/proveedores
`security:legal-release`; ninguno certifica por sí solo revisión de abogados.
Pasar los checks de integridad no significa que el corpus esté listo para una
liberación contractual internacional.

Verificación de esta extracción: build y typecheck correctos; 20 archivos de
pruebas y 218 casos aprobados; checks legal, CSS y health correctos; diff sin
errores de whitespace. El build mantiene advertencias previas de headers durante
prerender y tamaño de chunks. El gate estricto del corpus falla como se espera
por 24 borradores y 53 variantes pendientes. Sin migración ni despliegue.
