---
title: "Single Sign-On (SSO)"
description: "Habilita acceso con SAML 2.0 desde Google Workspace, Microsoft Entra u Okta."
category: "Cuenta y Equipo"
---

Gestionar decenas de contraseñas de empleados es un riesgo de seguridad. Cord ofrece Single Sign-On mediante **SAML 2.0** para organizaciones en plan **Scale o Developer**. Cualquier proveedor de identidad que hable SAML sirve —Google Workspace, Microsoft Entra ID / Azure AD, Okta, y otros— configurado como aplicación SAML de tu IdP, no como conexión OIDC directa.

### Configurar SSO

1. Ve a **Ajustes > Seguridad**.
2. Busca el módulo de conexiones SSO y añade tu proveedor de identidad como aplicación SAML.
3. Registra la URL de metadata o los datos del IdP (Entity ID, SSO URL y certificado) que te da tu panel de Okta, Azure AD o Google Workspace.
4. Reclama tu dominio corporativo (por ejemplo `@tuempresa.com`). Cord te da un token para colocar en un registro TXT de tu DNS, y verifica la propiedad consultando ese registro por DNS real —no basta con pegar el token en la pantalla.

Una vez que el dominio queda verificado y activas **Exigir SSO**, cualquier empleado que intente iniciar sesión con un correo de ese dominio usando contraseña es bloqueado y redirigido a tu proveedor de identidad. El dueño de la cuenta conserva siempre la opción de entrar con contraseña, como salida de emergencia si el proveedor de identidad falla.

### Qué automatiza y qué no

Cord soporta **aprovisionamiento JIT** (Just-In-Time): la primera vez que alguien de tu dominio entra vía SSO, Cord le crea su cuenta y membresía automáticamente, sin que tengas que invitarlo a mano. Cord **no** soporta SCIM: dar de baja a alguien en tu directorio (Google Workspace, Azure AD) no revoca su acceso a Cord de forma automática — para eso, revócalo también desde **Ajustes > Equipo** en Cord.
