---
title: "Identity verification and beneficial owners (KYC)"
description: "What verification asks for, why it changes by country, how to declare owners with 25% or more, and what to do when a document is rejected."
category: "Payments & Deposits"
order: 4
---

Before Cord can deposit money to you, the law requires verifying who you are and who controls your business. This is **KYC** (*Know Your Customer*), and it isn't a Cord formality: it's an anti-money-laundering requirement, with different rules in every country.

You do it once, in **Settings › Payments**, and the wizard picks up where you left off if you step away.

### The fields change by country, and that's correct

Not every country asks for the same thing, so Cord only shows what your country's verification actually uses:

- **Mexico** asks for the representative's CURP or personal RFC.
- **The United States** asks for the last 4 digits of the SSN, plus the name your customers will see on their card statement.
- **Spain, Germany, France and the UK** ask for no personal ID at all: if you don't see that field, nothing is missing.
- **Canada and Brazil** require the two-letter code for your province or state, not the written name.

If a field appears that you didn't expect, it's because your verification asked for it. Cord doesn't invent fields or collect them "just in case".

### Beneficial owners: who has to be on the list

In the European Union, the United Kingdom and Canada, declaring **every person holding 25% or more** of the business is mandatory. The People step is a list where you add each one:

- One person can hold **several roles at once**: legal representative, owner, director, executive. Each is ticked separately.
- If your legal representative is a hired director with **no shares**, that's what gets declared. They aren't credited with ownership they don't have.
- Each person carries their **own identity verification**, with its status visible in the list.
- The final box confirming the list is complete appears **after** you've built it.

A company with three shareholders at 30% declares all three. If you declare only one, the account won't activate: verification will keep asking for the ones missing.

### How to take the photos

You can upload files from your computer, but the fastest route is **"With your phone"**: scan a QR code and capture with your phone's camera, which almost always beats a desktop scan for light and focus.

- **You pick which document you'll use first**, from your country's list: INE in Mexico, DNI in Spain, Personalausweis in Germany, CNH in Brazil, state licence in the United States. That gives the camera frame the right shape and, if your document has no back (like a passport), that step is skipped automatically.
- If the person **lives in a different country from the business**, only a passport is accepted. That's a rule of the verification system, and Cord tells you before you take the photo.
- If verification asks for it, also **proof of address**: a recent utility bill or bank statement in that person's name. It must be a different document from the ID.
- IDs are sent as **JPG or PNG, in colour**. A PDF only works for proof of address and company documents.

**Cord checks the photo before sending it.** If it comes out blurry, dark, with a glare over it or low in contrast, Cord tells you and suggests what to fix. These are suggestions: if you think the photo is fine, you send it anyway. Only two things are stopped outright, because the verification system always rejects them: a black-and-white photo ID, and a photo so low in resolution that the document can't be read.

#### QR link security

- **Lasts 30 minutes**, and only 15 from the moment you first open it.
- **Is bound to the first phone that opens it.** If someone else intercepts it, it's useless to them.
- **Has an attempt limit.** If it runs out, generate a new one from your computer.
- **Won't accept the same photo twice.** If a document was rejected, you need a new photo: re-sending the same file fails automatically.

Your photos don't stay in Cord: they're transmitted encrypted straight to the financial verification system, and before sending them Cord strips their metadata, including the GPS location many phones write inside the image. Cord keeps each person's name and role so it can show you the list, plus a compliance record of each submission — what was sent, when, from which IP and what verification replied — for five years, as anti-money-laundering regulation requires. That record never includes the image or the document number.

### If a document is rejected, we tell you why

When a photo is rejected, the exact reason appears on that person's card: the image isn't readable, the document has expired, the name doesn't match what you entered, the back is missing, a photocopy was detected.

Read it before trying again. Uploading the same photo gives the same result.

### How long it takes

Most accounts activate within minutes. When verification needs a manual review, the status shows **"Under review"** and the screen updates on its own once it resolves — no need to keep refreshing.

If your account has been unresolved for days, or the rejection reason doesn't match the document you uploaded, write to us with your business name and we'll help unblock it.

### Changing details after activation

Editing a person's identity or your deposit account **asks you to confirm your identity again**, even though you're already signed in. That's deliberate: these are the details that decide where your money goes.
