---
title: "Single Sign-On (SSO)"
description: "Enable access with Google Workspace or Microsoft Entra."
category: "Account & Team"
---

Managing dozens of employee passwords is a security risk. For organizations with Enterprise plans, Cord offers Single Sign-On (SSO) integration via SAML or direct OIDC integrations (Google Workspace, Microsoft Entra ID / Azure AD, Okta).

### Configure SSO (Single Sign-On)

1. Go to **Settings > Organization Security**.
2. Find the **SSO Connections** module and add a new identity provider (IdP).
3. You will need to map the ACS (Assertion Consumer Service) metadata URL provided by your Okta or Azure AD dashboard.
4. Claim your corporate domain (e.g., `@yourcompany.com`). We will ask you to place a TXT record in your DNS to prove ownership.

Once active, any employee attempting to log in to Cord using a `@yourcompany.com` email will be redirected to your corporate login portal. Additionally, we support automatic provisioning (JIT/SCIM), meaning that when you remove an employee from your Active Directory, they instantly lose access to Cord.
