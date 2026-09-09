# Revisión técnica de cobranza, IA y uso aceptable — fase 5.3

Fecha de corte: **1 de septiembre de 2026**.

Este documento conserva evidencia para revisión jurídica; no es una opinión legal,
una evaluación de impacto completa ni una autorización para publicar o activar
funciones. Se contrastaron seis propuestas ES/EN con el código disponible y con
fuentes oficiales puntuales. No se modificaron runtime, datos, schema, proveedores,
cron, despliegue ni los cuatro artefactos legales publicados.

## Entregables y estado editorial

| Documento | ES-MX | EN-US | Resultado |
|---|---|---|---|
| `collections-notice` | Reescrito | Reescrito | Borrador técnico bloqueado |
| `ai-disclosure` | Reescrito | Reescrito | Borrador técnico bloqueado |
| `acceptable-use-policy` | Reescrito | Reescrito | Borrador técnico bloqueado |

Cada variante tiene ocho secciones, procedencia hacia el texto preservado,
`publicationStatus: draft`, acción nula, hash nulo y bloqueos explícitos. El guard
editorial compartido cubre ahora catorce propuestas: pagos, facturación, KYC,
evidencia de disputas, cobranza, IA y uso aceptable en dos idiomas.

El inventario global no cambia: **4 variantes publicadas, 24 borradores y 53
variantes ausentes**. De los 22 extractos iniciales, 14 ya son propuestas técnicas
y 8 siguen como material fuente; los otros 2 borradores son los DPA previos.

## Matriz de hechos y decisiones

| ID | Prioridad | Evidencia técnica observada | Tratamiento en la propuesta |
|---|---:|---|---|
| AUT-01 | P1 | Cobranza nace inactiva, en modo aprobación, con 3 días de gracia, cadencia de 7 días, umbral de plan de 15 días y máximo de 25 casos por corrida. Vercel Hobby ejecuta la corrida una vez al día. | Se describen los defaults como configuración revisada, no como garantía de frecuencia o entrega. |
| AUT-02 | P1 | La selección parte de cuentas vencidas y excluye saldos cubiertos, planes al corriente, exclusiones, mínimos, cadencia y límite por corrida. Los valores configurables se acotan en servidor. | Se explican los filtros y se exige al acreedor comprobar saldo, contacto y clasificación de la deuda. |
| AUT-03 | P0 | En aprobación se guarda un borrador; en automático se intenta enviar la salida del modelo sin revisión individual. | La diferencia es visible y el modo automático requiere supervisión, exclusiones y revisión jurídica por mercado. |
| AUT-04 | P1 | El correo identifica al acreedor, puede incluir su identificación fiscal, declara la automatización, usa Reply-To del acreedor y contiene enlace al documento o pago cuando existe. | Se conserva esa divulgación y se prohíbe borrar o contradecirla al editar. |
| AUT-05 | P0 | Responder o contactar al acreedor sólo inicia una solicitud de cese. `inbound-email` está deliberadamente fuera de `PUBLIC_API_PREFIXES`; Cord no procesa hoy la respuesta. La exclusión se hace manualmente por cliente, cotización o factura. | Se elimina cualquier promesa de baja instantánea y se bloquea publicación hasta demostrar canal, recepción y ejecución del cese. |
| AUT-06 | P0 | El historial que recibe el modelo representa tanto mensajes del vendedor como del comprador con el mismo rol. `propose_payment_plan` confía en que el contexto contenga una aceptación, pero no puede atribuirla de forma fiable. | Se bloquea negociación o activación automática de cuotas hasta separar participantes y conservar evidencia atribuible. |
| AUT-07 | P0 | En el flujo de aprobación, autorizar puede materializar el plan antes del intento de correo. Un fallo posterior de entrega puede dejar el plan activo. | Se divulga el orden real y se exige reconciliación; la corrección transaccional queda como trabajo técnico. |
| AUT-08 | P0 cerrado | La política central rechaza cualquier tasa moratoria mayor a cero y el cron omite configuraciones históricas con interés. | Las tres propuestas declaran el interés automático deshabilitado y no inventan una tasa por país. |
| AUT-09 | P1 | El borrador de cotización envía a Anthropic texto o imagen/PDF y el catálogo activo completo —identificadores, nombres, unidades y precios—. La respuesta vuelve al editor y ese endpoint no guarda ni envía la cotización. | Se enumeran entradas, destino, límites de validación y revisión humana antes de uso. |
| AUT-10 | P0 | Al autorizar un servidor MCP, gobernanza guarda normalmente `herramientas = ["*"]`. El agente puede llamar cualquier herramienta expuesta sin confirmación por llamada; no hay clasificación verificable de lectura/escritura. | Se bloquean herramientas con escritura o efectos externos hasta permisos granulares, clasificación, vista previa, confirmación y auditoría. |
| AUT-11 | P0 | El inventario local no contiene todavía contrato, región, retención ni configuración de entrenamiento de la cuenta Anthropic. La política pública del proveedor no prueba esos hechos de cuenta. | Se limita la afirmación pública y se mantiene `anthropic-account-evidence` como bloqueo. |
| AUT-12 | P0 | Los correos automáticos sí contienen divulgación visible; no existe una marca técnica universal para todo texto generado ni una evaluación por función/mercado. | Se exige evaluación específica de transparencia. La aplicación del artículo 50 del AI Act desde el 2 de agosto de 2026 necesita revisión jurídica europea. |
| AUT-13 | P1 | Existen validaciones, permisos, cuotas, límites, controles SSRF, revocación y suspensión manual de usuarios. No se demostró un motor general de detección ni un procedimiento completo de suspensión organizacional y apelación. | La AUP enumera sólo controles reales y presenta investigación, proporcionalidad y revisión como procedimiento pendiente. |
| AUT-14 | P1 | No existe reporte automático general a autoridades o proveedores ni derecho automático a infraestructura dedicada por alto consumo. | Se eliminan ambas promesas absolutas; cualquier comunicación o capacidad especial depende de fundamento y acuerdo aplicable. |

## Distinciones jurídicas que no deben colapsarse

- La clasificación de una cobranza comercial o de consumo depende de hechos que
  Cord no determina hoy. La Regulation F estadounidense regula a los *debt
  collectors* sujetos a la FDCPA; su mecanismo de opt-out electrónico es una
  referencia relevante para ese ámbito, no prueba que toda cobranza B2B de Cord
  esté sometida a la misma regla.
- REDECO/CONDUSEF se refiere a despachos de cobranza que actúan para entidades
  financieras en México. No debe presentarse como la clasificación automática de
  Flouvia, de sus clientes o de cada cuenta comercial.
- Informar que una persona interactúa con IA y marcar contenido sintético son
  obligaciones distintas. También difieren de obtener consentimiento, explicar
  una decisión o conceder un derecho de impugnación.
- La política pública de un proveedor y la configuración contractual de la cuenta
  usada por Cord son fuentes diferentes; falta conservar la segunda.
- Suspender un usuario, limitar una función y terminar una organización tienen
  consecuencias y evidencias distintas. El control actual sólo demuestra la
  primera acción de forma general desde Ops.

## Fuentes oficiales consultadas

- [Anthropic Privacy Center — uso de datos para entrenamiento](https://privacy.claude.com/en/articles/7996885-how-do-you-use-personal-data-in-model-training): distingue productos de consumo y comerciales, y contempla excepciones u opt-in. Se usa sólo como política pública, no como evidencia de la cuenta de Cord.
- [Reglamento (UE) 2024/1689, versión consolidada](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX%3A02024R1689-20260727): texto oficial del AI Act, incluido el artículo 50.
- [Comisión Europea — preguntas sobre transparencia del artículo 50](https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act): alcance orientativo y aplicación de las obligaciones desde el 2 de agosto de 2026.
- [CFPB — Regulation F](https://www.consumerfinance.gov/rules-policy/regulations/1006/) y [§ 1006.6](https://www.consumerfinance.gov/rules-policy/regulations/1006/6/): alcance FDCPA y opt-out en comunicaciones electrónicas para los sujetos regulados.
- [CONDUSEF — REDECO](https://pur.condusef.gob.mx/) y [disposiciones para despachos de cobranza](https://www.condusef.gob.mx/documentos/marco_legal/disp_despachos_cobranza.pdf): ámbito de entidades financieras y despachos en México.

La fecha de consulta fue el 1 de septiembre de 2026. Estas fuentes no sustituyen
el análisis por país, rol, tipo de deuda, destinatario, canal y fecha aplicable.

## Bloqueos antes de publicar o ampliar automatización

1. Separar vendedor y comprador en el historial y guardar evidencia atribuible
   de aceptación; impedir que el agente active cuotas desde contexto ambiguo.
2. Materializar el plan sólo después de entrega confirmada o implementar una
   compensación idempotente y visible si el correo falla.
3. Crear un canal de cese verificable, procesar la solicitud y auditar la exclusión;
   definir quién vigila Reply-To mientras el inbound siga cerrado.
4. Cambiar MCP de `[*]` a permisos por herramienta, clasificar efectos y pedir
   confirmación humana para escritura o acciones externas.
5. Conservar contrato/configuración real de Anthropic, región, retención, uso de
   datos y transferencias; reflejarlo en DPA y subprocesadores.
6. Diseñar un procedimiento de investigación, suspensión organizacional, aviso,
   preservación y apelación, sin afirmar detección universal.
7. Verificar identidad y contactos, retención, quejas y aplicabilidad por mercado
   con revisión jurídica bilingüe.
8. Sólo después, decidir versión, fecha de vigencia, acción de aceptación,
   artefacto, historial y publicación explícita.

## Verificación reproducible

Los tests de fase 5.3 fijan estructura, procedencia y estado no publicable, además
de las afirmaciones negativas críticas: no hay baja automática, atribución fiable,
confirmación MCP por llamada, marca técnica universal, motor general de abuso,
suspensión organizacional demostrada ni infraestructura dedicada prometida.

| Verificación | Resultado del 1 sep 2026 |
|---|---|
| Test focalizado | Pasa: 1 archivo, 33 pruebas |
| Check editorial | Pasa: 4 publicadas, 24 borradores, 14 propuestas técnicas y 53 variantes ausentes |
| Build | Pasa; conserva advertencias previas por headers durante prerender |
| Typecheck | Pasa |
| Suite completa | Pasa: 22 archivos, 257 pruebas |
| Checks legal, CSS y health | Pasan |
| `git diff --check` | Pasa |
| Gate estricto del corpus | Falla como se espera: 24 borradores y 53 variantes ausentes |

```sh
npm test -- --run test/legal-supplemental-review.test.ts
node --experimental-strip-types scripts/legal-editorial-check.mjs
npm run build
npm run typecheck
npm test
npm run security:legal
npm run security:css
npm run security:health
git diff --check
npm run security:legal-corpus-release
```

El último comando debe fallar mientras existan 24 borradores y 53 variantes
ausentes. Pasar los demás controles prueba coherencia técnica, no aprobación
jurídica ni preparación para publicación.
