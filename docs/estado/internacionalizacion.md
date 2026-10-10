# Internacionalización: cobertura y siguiente entrega

## Alcance aprobado

Español, inglés, portugués de Brasil, francés y alemán en páginas públicas,
dashboard y correos. Incluye mensajes de API visibles, autenticación, enlaces de
cotización/factura y configuración; el corpus legal exige publicación propia por
variante y no se considera traducido por traducir la interfaz.

El idioma del texto no cambia país fiscal, riel de cobro, divisa, impuestos ni
zona horaria. No se deduce de una IP ni de un país donde alguien esté viajando.

## Código vigente

- `src/i18n/locales.ts`: vocabulario de cinco idiomas y negociación por
  `Accept-Language`, variantes regionales, pesos válidos y preferencia manual.
  Cada superficie declara los idiomas que realmente puede servir.
- Landing y dashboard siguen habilitados sólo en ES/EN. Los catálogos
  principales contienen 238 y 3,630 claves por idioma respectivamente; esos
  conteos **no** incluyen todos los textos locales de componentes, contenido
  editorial ni respuestas de API. No son una medida de cobertura global.
- `src/i18n/auth-email.ts`: 26 claves por idioma, cinco idiomas completos para
  verificación de correo, recuperación, alerta de acceso, alta de passkey e
  invitación. Es catálogo de servidor separado del dashboard.
- Verificación, recuperación y alertas usan la preferencia explícita en
  `cord_public_lang` antes del navegador. El contexto personal de correo es
  independiente del idioma de la organización. Sin contexto conservan el
  idioma de la app; sin ninguna preferencia concreta, español; ante un idioma
  no cubierto, inglés.
- Las invitaciones usan por defecto el idioma de la organización. El helper
  acepta una preferencia explícita del destinatario en los cinco idiomas,
  pero todavía **no hay un selector ni dato persistido del destinatario**;
  los caminos actuales de equipo siguen mandándolas en ES/EN. El navegador
  de quien invita no determina el idioma de quien recibe.
- Correos de Cord Ops siguen internos y en español. Correos comerciales,
  cobranza e informes siguen ES/EN y tienen textos fuera del catálogo central.
- `security:i18n` exige paridad de claves, ausencia de duplicados y consumidores
  por catálogo/superficie. Las pruebas de correos verifican además variables,
  enlaces, plazos, remitentes y escape de nombres. No usan Resend ni Neon.

## Píldora solicitada — pendiente de activar

Conservar el diseño y dos opciones: **idioma local + EN**. El idioma local será
el primero no inglés compatible de las preferencias del navegador; una elección
manual no inglesa deberá persistir al alternar a EN. Si sólo hay inglés o no hay
una alternativa compatible, usar ES como alternativa. La URL explícita de una
página traducida manda al abrir un enlace directo; la negociación automática se
limita a las entradas previstas, no redirige cada navegación.

La píldora sigue ES/EN hoy: no se cambian sus etiquetas a PT/FR/DE hasta que sus
rutas y contenido existan. En páginas prerenderizadas, la selección del segundo
idioma tendrá que resolverse también en cliente, sin depender de headers SSR.

## Orden de trabajo restante

1. Traducir catálogos y contenido público por idioma; rutas reales, navegación,
   metadatos, alternates y selector adaptable de escritorio/móvil. No prefijar
   rutas de autenticación, dashboard ni tokens públicos arbitrariamente.
2. Traducir dashboard y componentes locales; ampliar validación y persistencia
   de Ajustes sólo cuando todos sus consumidores acepten el nuevo idioma.
3. Traducir autenticación visible, mensajes de API y enlaces `/q` y `/i`.
   Mantener la separación entre idioma de negocio y formato regional.
4. Completar correos comerciales, facturas, cobranza e informes; asegurar idioma
   estable en crons, reintentos y destinatarios sin sesión. No traducir el
   contenido libre redactado por el negocio sin su elección explícita.
5. Corpus legal PT/FR/DE: revisión, hashes y variantes publicables propias;
   nada de fallback oculto ni modificaciones a versiones ya aceptadas.
6. Recorridos completos de los cinco idiomas y tamaños de pantalla, revisión
   lingüística y medición de bundles. No cargar cinco diccionarios del dashboard
   en una isla del navegador.

Las fases legales 6 y 8 no se cierran por este incremento. El estado de sus
dependencias se conserva en [legal.md](legal.md) y [legal-corpus.md](legal-corpus.md).
