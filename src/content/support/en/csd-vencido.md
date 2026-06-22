---
title: "What to do if your CSD expired"
description: "Steps to upload your new Digital Seal Certificate."
category: "Billing & CFDI"
---

For Cord (or any PAC) to issue legal invoices on your behalf, you need to upload your **Digital Seal Certificate (CSD)**. Attention! The CSD is not the FIEL (e.firma).

### Why does my CSD appear as expired or revoked?

CSDs issued by the SAT have a strict validity of **4 years**. If it reaches its limit, all your invoices and automatic collections will fail with a cryptographic error.
Additionally, the SAT can **revoke** your CSD prematurely as a precautionary measure if it detects severe anomalies (e.g., failing to file an annual return or not being found at your tax domicile).

### How to update your CSD in Cord

1. Go to **Settings > Fiscal and SAT**.
2. In the *Digital Seal Certificate* section, you will see the status of your current seal.
3. Click on **Replace CSD**.
4. Upload your new `.cer` file, your new `.key` file, and the corresponding password.

**Time Tip:** After processing a new CSD on the SAT portal (Certifica), it takes **between 24 and 72 hours** to propagate through all SAT servers nationwide (the famous LCO). If you upload it to Cord on the same day you obtained it, the stamping will fail indicating that "The CSD is not found in the valid seals list". You must be patient.
