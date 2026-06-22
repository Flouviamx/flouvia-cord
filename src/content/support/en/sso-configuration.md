---
title: Single Sign-On (SSO) Configuration
description: Step-by-step guide to configure Enterprise Single Sign-On via SAML (Google Workspace, Microsoft Entra, Okta) in Cord.
category: equipo-y-roles
date: 2026-06-22
---

# Enterprise SSO Configuration

Single Sign-On (SSO) allows your employees to access Cord using the corporate credentials they already manage. This not only improves convenience but also centralizes access control within your identity provider (IdP).

## Benefits of SSO

- **Centralized Security:** Control access to Cord from your identity provider. If you revoke an employee's access in your active directory, they automatically lose access to Cord.
- **Frictionless Access:** Employees do not need to remember new passwords.
- **Just-in-Time Onboarding:** By enabling SSO, users from your domain can automatically join the organization without the need for manual email invitations.

## Supported Providers

Cord supports the **SAML 2.0** standard, making us compatible with most providers on the market, including:

- Microsoft Entra ID (formerly Azure AD)
- Google Workspace
- Okta
- Ping Identity
- OneLogin

## How to start configuration

Configuring Enterprise SSO requires us to exchange technical information (XML metadata and certificates) securely.

1. Navigate to **Settings > SSO** within Cord.
2. Click on **Start configuration**. This will open a direct channel with our technical support team.
3. We will ask you to provide the "IdP Metadata URL" or the configuration XML file from your system.
4. We will provide you with the "Assertion Consumer Service (ACS) URL" and the "Entity ID" that you must enter into your provider.

> [!NOTE]
> The SSO feature is available exclusively on the **Scale** and **Enterprise** plans. If you are on a lower plan, you will need to upgrade your subscription before starting the process.
