---
title: "Configure tax withholdings"
description: "How to turn on a default withholding for your quotes and invoices."
category: "Invoicing"
---

Withholdings aren't exclusive to Mexico: Cord's tax catalog seeds withholding profiles based on your country when the account is created (Income Tax and VAT withholding in Mexico, ReteIVA and ReteFuente in Colombia, IRPF in Spain, IGV withholding in Peru, among others). A withholding is **subtracted** from the total and calculated on the subtotal (or on the tax itself, in countries where the law requires it, like Colombia).

### How a withholding is applied in Cord

Withholdings **aren't chosen line by line** like the regular tax rate — they're a policy for the whole document. To have one applied automatically to your new quotes:

1. Go to **Settings › Quotes › Taxes** and review your organization's catalog — it already comes seeded with your country's standard profiles, including their withholdings.
2. Mark as **default** the withholding profile that applies to your operation (for example, "1.25% Income Tax withholding" if you invoice fees to Legal Entities under RESICO in Mexico).
3. From that point on, any new quote or invoice for that organization will automatically apply that withholding on the subtotal, without you having to capture it on every document.

<Callout type="warning">
Cord does not automatically detect your tax regime or your client's to decide whether a withholding applies — it's applied because you marked a profile as default in the catalog, not because the system inferred you're invoicing a Legal Entity under RESICO. Since it's a whole-document policy (not a line-item one), a profile marked as default applies to **every** new quote or invoice while it stays marked that way. If your business mixes sales that do carry a withholding (professional services) with ones that don't (selling a good), you'll need to unmark the profile as default before capturing the ones that don't, and mark it again afterward.
</Callout>

In Mexico, when converting the quote to a CFDI, the XML includes the `Retenciones` node with the withheld amounts. In countries with no applicable withholdings, the catalog simply has no profiles of that kind and the section doesn't appear.
