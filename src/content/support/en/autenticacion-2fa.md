---
title: "Configure two-factor authentication"
description: "Set up 2FA and understand when it is required."
category: "Account & Team"
---

# Configure two-factor authentication


## Two-factor verification and access

Enable 2FA under **Settings > Your account**: scan the QR with your authenticator,
confirm the code and store the ten one-use backup codes shown during activation.

When an organization requires 2FA and you have not configured it, complete setup
before continuing. Protection also applies to dashboard requests, not only the
visible screen. Actions needed to set up 2FA, confirm identity or sign out remain
available.

If a sensitive action asks you to verify your identity again, complete it before
retrying. Team permissions still apply; enabling 2FA does not grant refund or
business administration permissions.

> Availability of the September improvements is being verified. See [scope and release status](https://docs.cordhq.app/en/pagos/mejoras-confiabilidad); contact support if a described action is not yet shown in your account.

## Idle sign-out: implementation under validation

The timeout configured by the business in **Settings › Security** is checked
when entering the app, billing and protected internal APIs. Once it expires,
the operation stops and you must sign in again. Passkey enrollment also checks it.

Visiting a public page or using 2FA recovery routes does not restart this window.
Activity means authenticated requests to protected surfaces, not mouse movement;
automatic app requests may also count. A value of zero disables the idle timeout
while retaining the maximum session lifetime, revocation and account suspension.

Checking and refreshing activity happen together so concurrent requests cannot
renew an already expired session. This protection has local tests; publication
and integrated sign-in acceptance remain to be verified.
