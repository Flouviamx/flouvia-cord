---
title: "[EN] Single Sign-On (SSO)"
description: "Habilita acceso con Google Workspace o Microsoft Entra."
category: "Account & Team"
---

Gestionar decenas de contraseñas de empleados es un riesgo de seguridad. Para organizaciones con planes Enterprise, Cord ofrece la integración de Single Sign-On (SSO) mediante SAML o integraciones OIDC directas (Google Workspace, Microsoft Entra ID / Azure AD, Okta).

### Configurar SSO (Single Sign-On)

1. Ingresa a **Ajustes > Seguridad de la Organización**.
2. Busca el módulo de **Conexiones SSO** y añade un nuevo proveedor de identidad (IdP).
3. Deberás mapear la URL de metadatos ACS (Assertion Consumer Service) proporcionada por tu panel de Okta o Azure AD.
4. Reclama tu dominio corporativo (ej. `@tuempresa.com`). Te pediremos colocar un registro TXT en tus DNS para probar tu propiedad.

Una vez activo, cualquier empleado que intente iniciar sesión en Cord utilizando un correo `@tuempresa.com` será redirigido a tu portal corporativo de inicio de sesión. Además, soportamos el aprovisionamiento automático (JIT/SCIM), lo que significa que cuando das de baja a un empleado de tu Active Directory, pierde acceso a Cord instantáneamente.
