---
title: "Update your deposit account"
description: "How to change the bank account where you receive payouts, in your country's format."
category: "Account & Team"
order: 3
---

Cord doesn't hold your funds: money from your sales goes straight to whatever bank account you have on file. The account format depends on your **organization's country** — the 18-digit CLABE is exclusive to Mexico. Outside Mexico, Cord asks for the matching format instead: IBAN (Spain and the rest of the SEPA zone), routing number + account number with an ABA checksum (United States), sort code (United Kingdom), transit + institution number (Canada), BSB (Australia), or bank code + agência (Brazil). The account field adapts automatically when you open the screen — you never have to "translate" your number into a Mexican format.

### Two separate ways to get paid

Under **Settings > Payments** (`/app/ajustes/cobros`) there are two independent sections:

- **Cord Payments (online payments):** if your country supports it, you can connect an account and let clients pay by card directly on the public link; in Mexico, Cord also generates a unique CLABE per quote and reconciles the SPEI transfer automatically. The payout to your bank is handled by Cord Payments once your account is verified.
- **Manual bank transfer:** works in every country, whether or not online payments are available there. This is the section where you configure the bank, the account number (in your country's format), and the beneficiary shown on the public link and the PDF. Since the money goes straight to your account and never passes through Cord, you mark the quote as paid yourself once you receive it.

### Update the manual transfer bank details

1. Go to **Settings > Payments**.
2. In the **Manual bank transfer** card, update the bank name, the account number (CLABE, IBAN, routing + account, sort code, transit + institution, or BSB, depending on your country), and the beneficiary name.
3. Save. Cord validates your country's control digit before accepting it (for example, the IBAN's mod-97 or the US ABA checksum), so you don't end up depositing to a mistyped number.

From that moment on, every public quote link — including old ones still pending — shows the new account. If you also have Cord Payments connected, updating the payout account for online charges is done from the same Payments screen, not here: that account is validated by Cord Payments as part of your identity verification.
