# Hallazgos de producto de la auditoría de docs (oct 2026)

> Backlog vivo. Al reescribir docs.cordhq.app contra el código (oct 2026), los
> agentes que leyeron cada pantalla encontraron problemas **de la app**, no de la
> documentación. Las docs ya describen el comportamiento real (incluidos estos
> huecos); aquí queda lo que hay que arreglar en el producto.
>
> **[verificado]** = confirmado contra el código el 8 oct 2026 por la sesión que
> escribió este documento. El resto lo reportó un agente con archivo y línea, pero
> conviene reconfirmarlo antes de tocarlo: `main` sigue moviéndose. Cuando un
> punto se corrija, bórralo de aquí y ajusta la página de docs que lo menciona.

## P0 — producción rota, dinero o privacidad

1. **[verificado] El cron de recordatorios truena.** `src/pages/api/cron/recordatorios.ts:132`
   usa `${origin}`, que no está declarado. En cuanto una cotización cumple un día
   vencida, `ReferenceError` aborta la corrida **antes** de la escalera de
   recordatorios de factura y de `invoice.overdue`. Arreglo: `siteOrigin()` de
   `src/lib/email.ts` (patrón de `cron/expirar-cotizaciones.ts`).
2. **[verificado] Mismo bug en el agente de cobranza.** `src/lib/agents/cobranza-run.ts`
   (~406) llama `renderDigestEmail(..., origin)` sin `origin` declarado: el correo
   resumen del modo aprobación falla después de guardar los borradores.
3. **[verificado] Fuga de eventos internos al cliente.** Los eventos internos se
   guardan con `tipo = 'comment'`: "Solicitud de aprobación: …" (puede incluir el
   % de margen, `src/lib/cotizaciones.ts:415`), "Versión N creada" y "Borrador
   actualizado" (`src/lib/actions/quotes.ts:33,247`). La conversación pública los
   lee (`src/lib/queries.ts:1952`) y los pinta como mensajes del cliente (`:2075`);
   la campana los rotula "Nuevo mensaje del cliente". Usar un `tipo` interno
   propio y excluirlo de la conversación.
4. **Cursor de `/api/v1/facturas` roto.** `next_cursor` es `String(Date)` (no ISO),
   compara `created_at <` sin desempate por `id` (salta facturas del mismo
   instante) y un cursor inválido no se valida (probable 500). `getFacturas` en
   `src/lib/queries.ts`.
5. **Approval de borradores de factura del agente.** La aprobación sólo busca en
   cotizaciones (404 para borradores sobre facturas) y un plan sobre factura
   insertaría un id de documento en una columna de cotización.
6. **`splitCuotas()` sin divisa** (`src/lib/agents/ar-agent.ts:87`,
   `src/pages/api/cobranza-ia/[id].ts:175`): parte en centavos también CLP/JPY.

## P1 — topes, permisos y contratos que se pueden saltar

7. **[verificado] Tope de 5 envíos/mes de Gratis evitable.** "Crear y enviar"
   (`createCotizacion` con `send`, `src/lib/cotizaciones.ts:336`, también por
   `/api/v1/cotizaciones`) marca `sent` sin `reserveUsage('envios')`. Sólo "Enviar
   al cliente" y el arrastre del tablero cuentan.
8. **Aprobaciones internas (Scale) evitables.** Los umbrales sólo se evalúan en
   `createCotizacion`; un borrador guardado y enviado después con `send` (botón,
   tablero, "Guardar y enviar") los salta, incluso tras un rechazo.
9. **"Aprobar y enviar" no envía el correo** al cliente (`approve_request` no
   llama `notifyQuoteSent`).
10. **[verificado parcial] Duplicar cotización.** `src/pages/api/cotizaciones/[id]/duplicate.ts`
    ya conserva la divisa, pero no copia `tax_rate`/`costo_unitario` por línea,
    `iva_incluido`, anticipo, iguala ni retenciones; copia totales que ya no
    cuadran; no tiene `requirePerm('cotizar')`; folio por max+1 (carrera) y el
    límite de cotizaciones activas sólo lo atrapa el trigger (500 en vez de 402).
11. **Importar clientes sin permiso.** `src/pages/api/clientes/import.ts` no tiene
    `requirePerm('clientes')` (productos sí) ni captura el error de límite de plan.
12. **[verificado] Reintentos de webhooks diarios.** El barrido `/api/cron/webhooks`
    corre `0 5 * * *` (`vercel.json`), así que los intentos 2–11 no siguen el
    calendario de 10 s / 1 min / 5 min. Las docs ya lo dicen; decidir si se sube la
    frecuencia.
13. **`/api/v1/events`**: no filtra tipos internos (`quote.expiring`,
    `invoice.due_soon`, `invoice.past_due`, `schedule.tick`) y responde
    `invalid_request` en vez de `invalid_cursor`. `listCursor` sólo valida la forma:
    un cursor de otro recurso llega a la base (probable 500).
14. **Campos de API que son texto de pantalla**: `terminos` ("Net 30"), `vigencia`
    y `creada` ("10 sep 2026") en cotizaciones, facturas y clientes. Exponer el
    dato (`net30`, ISO) y dejar el texto como campo aparte.
15. **`POST /api/v1/setup/plans`**: 413 y 502 salen con `code: invalid_request` y
    no valida content-type como las demás rutas.
16. **`test_helpers/webhooks` con `objeto_id`** devuelve `datos: "real"` aunque el
    objeto no exista o no corresponda, y registra un evento de dominio real que
    dispara workflows e integraciones.
17. **`cord listen` pierde eventos**: se marca entregado al recogerlo; si el
    reenvío a tu servidor falla, no se reintenta.
18. **Email de persona en `actor`**: `slack:<email>` expone un correo vía
    `/api/v1/events`.
19. **Límite por IP antes que el de llave**: 120/min por IP corta antes de los
    600/min por llave; una integración desde una sola IP nunca llega a 600.
20. **Tope de webhooks inconsistente**: `src/lib/precios.ts` publica 1/3/10/25/100
    endpoints y `WEBHOOK_LIMITS` en `entitlements.ts` aplica 16/16/16/32/100.

## P2 — reglas permanentes rotas (14, 15, 21, 36)

21. **Regla 15 — preferencias sin consumidor**: Plantillas de mensaje
    (`getPlantillas()` sólo la lee su página; WhatsApp usa texto fijo en
    `src/pages/app/cotizaciones/[id].astro`), "Leyenda legal"/`orgs.texto_legal`,
    `fx_locked_until` (el editor promete "Tasa congelada 30 días" y nada lo lee), el
    contador "Abrió el PDF" (el selector no matchea `#qPdfBtn`).
22. **Regla 21 — divisa en etiquetas fijas**: `pmod.precio_venta`/`pmod.costo_pregunta`
    "(MXN)", `cmod.limite_credito` "(MXN)", `q.propuesta_placeholder` "Propuesta en
    MXN", `set.aprob.monto_max` "(MXN)" (compara contra el total en la divisa de la
    cotización sin convertir), `'$'` fijo en el tablero de cotizaciones, aviso
    `quote_expiring` sin `moneda`, y en `/api/v1/cobranza` los `items` no traen
    divisa y `resumen`/`aging` suman divisas distintas (igual `cerrado` en clientes).
23. **Regla 14 — proveedor visible al usuario**: descripción de la categoría
    Cobros en `src/lib/settings.ts` ("tarjeta vía Stripe"), errores de
    `src/pages/api/fiscal/csd.ts` ("Facturapi rechazó el CSD"), correo de cobranza
    "Pago seguro procesado por Stripe", y el CNAME de dominio propio muestra el
    dominio del proveedor de hosting.
24. **Regla 36 — texto sólo en español en cuentas en inglés**: `CustomSignUp.tsx`
    y `VerifyEmail.tsx` (alta), `LiveCapture.tsx` ("Usar foto", "Subiendo...") y
    `IdentityCaptureMobile.tsx` (`COPY`), motivo de aprobación construido en
    servidor, eventos "Propuesta:"/"Firmado digitalmente por" en
    `src/pages/api/q/[token].ts`, títulos de tareas automáticas ("Responder
    contracargo", "Transferir reembolso SPEI"), "(iguala)" y la nota de nivel en
    `nueva.astro`, `plan.astro` con `PLANES` en español, recordatorios de cobro
    siempre en español, error de "100 suscripciones" en `src/lib/actions/webhooks.ts`,
    falta `set.api.rec.setup` en `src/i18n/app.ts` (la UI muestra la clave cruda).
25. **Copy de la UI que no coincide con el comportamiento**: "Tasa de cierre ·
    últimos 90 días" se calcula sobre todo el historial; "De enviada a pagada · en
    el rango" no sigue el rango; `set.notif.ev.rejected_desc` dice "rechazó o
    contraofertó" (la contraoferta no notifica); `viewed_desc` dice "alguien abre"
    (sólo la primera apertura del cliente); `q.legal_firma` dice "Firma
    electrónica con validez legal", más fuerte que el aviso legal de las docs; el
    enlace de captura dice "duran 10 minutos" (son 30 y 15); la pantalla de
    Verifactu dice "las facturas ya se encadenan" con `VERIFACTU_AEAT_ENABLED`
    apagado; estados de disputa en inglés crudo del procesador.
26. **Menores de UI**: "10:42 a.m.." con punto
    doble en "Prueba sin publicar" (`wf.probar_con_evento` + es-MX); la paleta usa
    `sparkle` para IA (el estándar es `cpu`); "Descargar comprobante" oculta el
    sello al imprimir (`.q-actions-area`); presencia pública muestra el correo del
    vendedor si no tiene nombre; el snapshot de versión guarda
    `notas = null`; líneas armadas con IA no reciben el descuento de nivel; el
    importador de productos adivina "costo" como precio de lista. (Resueltos con
    el editor unificado, oct 2026: el icono del botón de quitar línea, la vigencia
    que no se extendía al reenviar y los campos del editor del mismo gris que el
    lienzo.)

## P3 — paquetes y documentación interna desactualizada

27. `packages/node/CHANGELOG.md` y `@flouviahq/elements` dicen "sin publicar"
    versiones que npm ya tiene (1.1.0 y 2.0.2). `QuoteStatus` en
    `packages/elements/src/types.ts` no tiene `viewed`, `expired` ni `invoiced`;
    `cord:resize` está documentado pero no está en `RELAYED` (`core.ts`). Python y
    PHP siguen sin publicar (PyPI `cord-sdk` y Packagist `flouviahq/cord` 404) aunque
    sus README dicen lo contrario.
28. `docs/estado/cobros-facturacion.md`: dice que la cuenta de depósito sólo acepta
    CLABE, cuotas 2–3 (código: 2–6), Gratis 5 documentos (código: 10), que la cobranza
    con IA "sigue sin agendar", y que la cartera une cotizaciones y facturas (la
    pantalla `/app/cobranza` sólo lista cotizaciones aprobadas con su total; la vista
    unificada alimenta al agente, el estado de cuenta y workflows).
29. `src/lib/roadmap-data.ts` (~827) sigue con jerga interna ("fase 2", "rol real de
    base de datos") en el texto público del roadmap, y `src/lib/precios.en.ts:158`
    anuncia "AI CFO (cash flow insight)", que no existe.

## Pendientes operativos (no son código)

- **Probar en producción** lo que las docs marcan como "función nueva": pagos de
  QuickBooks/Xero (QuickBooks sólo en sandbox; Intuit no aprobó producción),
  Slack interactivo (vista previa, `/cord`, botones), Teams con "Conectar con
  Microsoft" en un tenant real, tarjeta de Cord en HubSpot, Shopify existencias/
  facturas/precios B2B, envío por Gmail (registrar el callback en Google y la
  verificación), Mercado Pago fuera de México y Colombia. Al confirmarse, quitar
  el Callout de función nueva de su página.
- Confirmar `SAML_SP_PRIVATE_KEY`/`SAML_SP_CERT` en producción (SSO se documenta
  como disponible en Scale).
