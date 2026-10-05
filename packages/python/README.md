# cord-sdk (Python)

SDK de Python para la API de [Cord](https://cordhq.app). Sin dependencias, Python 3.9+.

```bash
pip install cord-sdk
```

```python
from cord import Cord

cord = Cord("sk_test_...")
quote = cord.quotes.create(
    cliente={"empresa": "Acme"},
    items=[{"descripcion": "Instalación", "cantidad": 1, "precio_unitario": 12500, "tax_rate": 0.16}],
    base_currency="MXN",
)
print(quote["folio"], quote["link_publico"])

for invoice in cord.invoices.list_all(estado="open"):
    print(invoice["numero"], invoice["saldo"], invoice["moneda"])
```

- Toda mutación lleva `Idempotency-Key`, la misma en cada reintento: un corte de red nunca duplica nada. Pasa `idempotency_key=` para atarla a tu propio identificador.
- Reintentos con `Retry-After` ante 429 y 5xx. Los errores son `CordError` con `status`, `code`, `request_id` y `doc_url`.
- Manda `Cord-Version: 2026-10-01`; cámbiala con `Cord(sk, api_version=...)`.

## Webhooks

```python
from cord import construct_event, WebhookSignatureError

@app.post("/webhooks/cord")
def cord_webhook(request):
    try:
        event = construct_event(request.body, request.headers, os.environ["CORD_WEBHOOK_SECRET"])
    except WebhookSignatureError as e:
        return Response(status=400)
    if event["event"] == "invoice.paid":
        ...
    return Response(status=200)
```

Usa el cuerpo crudo. Exige `X-Cord-Signature-V1` con timestamp (5 minutos de tolerancia); la firma legacy solo con `allow_legacy_signature=True`. Deduplica por `event["id"]`.

## Modo prueba

```python
cord = Cord("sk_test_...")
cord.test_helpers.set_next_fiscal_outcome("pac_caido")
cord.test_helpers.trigger_webhook("invoice.paid")
```
