---
title: "Connect WhatsApp Business"
description: "Send reminders and alerts over WhatsApp from your workflows, with your Meta-approved template."
category: "Account & Team"
order: 23
---

Cord sends WhatsApp through **Meta's Cloud API** and with **your** account: messages go out from your number and Meta charges the per-conversation cost to your account, not to Cord.

### Before you start

Meta does not allow starting a conversation with free text: only with an **approved template**. That is why Cord asks for your template name and fills its variables; there is no free-text field, because the message would be rejected.

### The steps

1. In [Meta for Developers](https://developers.facebook.com), create a **WhatsApp Business** app and add your sending number.
2. In **WhatsApp Manager**, create a message template and submit it for approval. Example: `Hi {{1}}, your quote {{2}} expires on {{3}}. You can see it here: {{4}}`.
3. Copy the **phone number ID** (digits only) and generate a **permanent access token**.
4. In Cord, go to **Settings › Integrations › WhatsApp Business**, paste both, write the template name and its language (for example `en_US`).
5. Click **Save** and then **Send test** with your own number, with its country code.

The token is stored encrypted and never shown again. To change the template you do not need to paste it again: leave the field empty.

### Using it in a workflow

In **Workflows**, the **Send the client a WhatsApp** action sends your template to the phone of the document's client. Each step variable fills `{{1}}`, `{{2}}`… in order, and accepts event data: `{{cliente}}`, `{{folio}}`, `{{total}}`, `{{vence}}`.

The phone comes from the client, never from a field in the step, and it must include the **country code** (`+52 55 1234 5678`). A number without one is not sent: Cord does not guess the country, because the same number exists in several.

### If something fails

- **"The client has no phone with a country code on file"**: edit the client and save the number with `+` and its country code.
- **"WhatsApp did not accept your template"**: check that it is approved, that the name matches and that the workflow has the same number of variables as the template.
- **"WhatsApp did not accept the message"**: usually an expired token or a sending number disabled in Meta.

### Limits

Workflows send up to 60 WhatsApp messages per hour per account, and the Settings test up to 5 per hour. The per-conversation cost is Meta's and depends on the country.
