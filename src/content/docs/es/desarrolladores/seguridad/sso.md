---
title: "SSO y SAML"
description: "Asegura el acceso al ecosistema de Cord usando tu proveedor de identidad corporativo."
---

<header class="content-header">
  <h1 class="page-title">Configuración SSO (Single Sign-On)</h1>
  <p class="page-subtitle">Delega la autenticación de Cord a tu proveedor de identidad empresarial (Okta, Google Workspace, Azure AD).</p>
</header>

## Enterprise Security (Seguridad Empresarial)

A medida que las organizaciones crecen, gestionar usuarios y contraseñas de manera individual se convierte en un riesgo inmanejable. Cord soporta integraciones de clase mundial usando **SSO (SAML)**.

Al habilitar SSO en tu organización de Cord:
- Tus empleados inician sesión automáticamente si ya están autenticados en su portal corporativo de trabajo.
- Cualquier política estricta de **MFA (Multi-Factor Authentication)** que configures en tu proveedor de identidad (Okta) es impuesta obligatoriamente antes de que Cord conceda el acceso.
- Cuando un empleado abandona la empresa, el departamento de IT solo debe deshabilitar su cuenta corporativa central y automáticamente pierde el acceso a los datos financieros sensibles de Cord.

## Requisitos Previos

1. Tu organización debe estar suscrita a un **Plan Enterprise** de Cord (esta función no está disponible en niveles de introducción).
2. Debes tener el rol de Administrador en Cord (o permisos explícitos de `ajustes` y `equipo`).
3. Debes tener privilegios de Administrador en tu Proveedor de Identidad.

## Pasos de Configuración SAML

La configuración requiere un intercambio bidireccional entre Cord y tu Proveedor de Identidad.

1. Navega a **Ajustes > Seguridad > SSO**.
2. Copia la **ACS URL** (Assertion Consumer Service) y el **Entity ID** que Cord ha generado para tu organización.
3. Ingresa estos datos al crear la nueva aplicación SAML en Okta, Azure AD o el proveedor que elijas.
4. Una vez creada la aplicación en tu proveedor, obtendrás una URL de inicio de sesión de IdP y un **Certificado X.509**.
5. Pega la URL de inicio de sesión y sube el certificado X.509 a la configuración de Cord.

> **Importante:** Prueba la integración con un solo usuario antes de forzarla a todo el equipo, de lo contrario podrías dejar fuera (locked out) a todo tu personal si la configuración tiene errores de mapeo.
