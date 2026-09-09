---
title: "Avoid duplicating a recurring invoice"
description: "What to check when issuance or email delivery fails."
category: "Invoicing"
---

# Avoid duplicating a recurring invoice


## Scheduled-period protection

Cord checks that the recurrence is still active and retains the date and settings
read before claiming the period. This prevents two runs from claiming the same
issuance or overlooking a concurrent edit or pause. The next date is calculated
from the scheduled period and respects the end date. Invalid dates and an end
before the start are rejected.

Creating a recurrence does not add automatic charging. If issuance fails, review
**Last error** and the document before repeating it; automatic recovery of every
failed period is not implemented.

If only email delivery failed, resend the existing invoice. See [the recurrence guide](/en/docs/pagos/facturas-recurrentes).

> Availability of the September improvements is being verified. See [scope and release status](https://docs.cordhq.app/en/pagos/mejoras-confiabilidad); contact support if a described action is not yet shown in your account.
