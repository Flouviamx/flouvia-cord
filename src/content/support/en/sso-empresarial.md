---
title: "Single Sign-On (SSO)"
description: "Enable SAML 2.0 access from Google Workspace, Microsoft Entra, or Okta."
category: "Account & Team"
---

Managing dozens of employee passwords is a security risk. Cord offers Single Sign-On through **SAML 2.0** for organizations on the **Scale or Developer** plan. Any identity provider that speaks SAML works — Google Workspace, Microsoft Entra ID / Azure AD, Okta, and others — configured as a SAML application on your IdP, not as a direct OIDC connection.

### Configure SSO

1. Go to **Settings > Security**.
2. Find the SSO connections module and add your identity provider as a SAML application.
3. Register the metadata URL or the IdP details (Entity ID, SSO URL, and certificate) from your Okta, Azure AD, or Google Workspace dashboard.
4. Claim your corporate domain (for example `@yourcompany.com`). Cord gives you a token to place in a DNS TXT record, and verifies ownership by querying that record over real DNS — pasting the token into the screen isn't enough.

Once the domain is verified and you turn on **Require SSO**, any employee trying to sign in with a password using an email from that domain is blocked and redirected to your identity provider. The account owner always keeps the option to sign in with a password, as an emergency exit if the identity provider goes down.

### What's automated and what isn't

Cord supports **JIT provisioning** (Just-In-Time): the first time someone from your domain signs in via SSO, Cord creates their account and membership automatically, without you having to invite them by hand. Cord does **not** support SCIM: removing someone from your directory (Google Workspace, Azure AD) does not automatically revoke their access to Cord — for that, revoke it as well from **Settings > Team** in Cord.
