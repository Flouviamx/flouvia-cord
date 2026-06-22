---
title: Configuración de Single Sign-On (SSO)
description: Guía paso a paso para configurar el Inicio de sesión único empresarial mediante SAML (Google Workspace, Microsoft Entra, Okta) en Cord.
category: equipo-y-roles
date: 2026-06-22
---

# Configuración de SSO Empresarial

El Inicio de sesión único (SSO) permite a tus empleados acceder a Cord utilizando las credenciales corporativas que ya manejan. Esto no solo mejora la comodidad, sino que centraliza el control de acceso en tu proveedor de identidad (IdP).

## Beneficios del SSO

- **Seguridad centralizada:** Controla el acceso a Cord desde tu proveedor de identidad. Si revocas el acceso a un empleado en tu directorio activo, perderá automáticamente el acceso a Cord.
- **Acceso sin fricción:** Los empleados no necesitan recordar nuevas contraseñas.
- **Onboarding automático (Just-in-Time):** Al habilitar SSO, los usuarios de tu dominio pueden unirse automáticamente a la organización sin necesidad de invitaciones manuales por correo electrónico.

## Proveedores compatibles

Cord soporta el estándar **SAML 2.0**, lo que nos hace compatibles con la mayoría de proveedores del mercado, incluyendo:

- Microsoft Entra ID (antes Azure AD)
- Google Workspace
- Okta
- Ping Identity
- OneLogin

## Cómo empezar la configuración

La configuración de SSO Empresarial requiere que intercambiemos información técnica (metadatos XML y certificados) de forma segura.

1. Navega a **Ajustes > SSO** dentro de Cord.
2. Haz clic en **Empezar configuración**. Esto abrirá un canal directo con nuestro equipo de soporte técnico.
3. Te pediremos que nos proporciones la "URL de Metadatos del Proveedor de Identidad" (IdP Metadata URL) o el archivo XML de configuración de tu sistema.
4. Nosotros te entregaremos la "URL de Respuesta" (ACS URL) y el "Identificador de la Entidad" (Entity ID) que deberás ingresar en tu proveedor.

> [!NOTE]
> La función de SSO está disponible exclusivamente en los planes **Scale** y **Enterprise**. Si tienes un plan menor, deberás actualizar tu suscripción antes de iniciar el proceso.
