---
title: "Reportar vulnerabilidades"
description: "Cómo reportar una falla de seguridad en Cord y qué puedes esperar de nosotros."
category: "Seguridad y Privacidad"
order: 3
---

Si encontraste una falla de seguridad en Cord, queremos saberlo. Este es nuestro programa de divulgación responsable: cómo reportar, qué está dentro del alcance y qué nos comprometemos a hacer.

### Cómo reportar

Escribe a `security@flouvia.com` con:

1. Qué encontraste y por qué importa (qué podría hacer alguien con ello).
2. Los pasos exactos para reproducirlo, con las URL, peticiones o el código de prueba.
3. La cuenta o el entorno en el que lo probaste.

Usa una cuenta propia y, si puedes, el entorno de prueba (llaves `sk_test_` / `pk_test_`). Si al probar llegas a datos de otra organización, detente, no los guardes ni los compartas, y dinos qué alcanzaste a ver.

El mismo contacto está publicado en [`/.well-known/security.txt`](https://cordhq.app/.well-known/security.txt).

### Alcance

- `cordhq.app`, incluida la API en `cordhq.app/api` y los subdominios `billing.`, `docs.` y `dev.`.
- Las superficies públicas: el link de la cotización (`/q`), la factura hospedada (`/i`) y el cotizador embebido (`/embed`).
- Los paquetes publicados: `@flouviahq/elements`, `@flouviahq/node` y `@flouviahq/cli`.

**Fuera del alcance:** ataques de denegación de servicio o de volumen, ingeniería social contra el equipo o los clientes de Cord, acceso físico, spam o pruebas automatizadas que generen carga sobre cuentas que no son tuyas, y hallazgos sin impacto demostrable (por ejemplo, encabezados ausentes sin un escenario de ataque).

### Qué nos comprometemos a hacer

- Acusar recibo en un máximo de **3 días hábiles**.
- Darte una evaluación inicial y mantenerte al tanto mientras lo corregimos.
- Avisarte cuando esté corregido, y coordinar contigo cuándo se puede publicar.
- Darte crédito público si lo quieres.

### Puerto seguro

Si actúas de buena fe dentro de este alcance, no accedes ni conservas más datos de los necesarios para demostrar la falla y nos das tiempo razonable para corregirla antes de publicarla, no tomaremos acciones legales en tu contra por tu investigación.

### Recompensas

Hoy no pagamos recompensas económicas. Si eso cambia, lo publicaremos en esta página.
