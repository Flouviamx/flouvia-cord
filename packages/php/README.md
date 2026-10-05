# flouviahq/cord (PHP)

SDK de PHP para la API de [Cord](https://cordhq.app). PHP 8.1+, sin dependencias (solo `ext-curl` y `ext-json`).

```bash
composer require flouviahq/cord
```

```php
use Flouvia\Cord\Cord;

$cord = new Cord(getenv('CORD_SECRET_KEY'));
$quote = $cord->quotes->create([
    'cliente' => ['empresa' => 'Acme'],
    'items' => [['descripcion' => 'Instalación', 'cantidad' => 1, 'precio_unitario' => 12500, 'tax_rate' => 0.16]],
    'base_currency' => 'MXN',
]);

foreach ($cord->invoices->listAll(['estado' => 'open']) as $invoice) {
    echo $invoice['numero'], ' ', $invoice['saldo'], ' ', $invoice['moneda'], PHP_EOL;
}

$cord->invoices->action($id, 'payment', ['monto' => 5000, 'moneda' => 'MXN'], idempotencyKey: "pago-{$miId}");
```

- Toda mutación lleva `Idempotency-Key`, la misma en cada reintento.
- Reintentos con `Retry-After`; errores `CordException` con `status`, `errorCode`, `requestId` y `docUrl`.
- Manda `Cord-Version: 2026-10-01` (opción `api_version`).

## Webhooks (Laravel)

```php
use Flouvia\Cord\Webhook;
use Flouvia\Cord\WebhookSignatureException;

Route::post('/webhooks/cord', function (Request $request) {
    try {
        $event = Webhook::constructEvent($request->getContent(), $request->headers->all(), env('CORD_WEBHOOK_SECRET'));
    } catch (WebhookSignatureException $e) {
        abort(400);
    }
    if ($event['event'] === 'invoice.paid') { /* ... */ }
    return response('ok');
});
```

Usa el cuerpo crudo. Exige `X-Cord-Signature-V1` con timestamp; la legacy solo con `allowLegacySignature: true`. Compara con `hash_equals` (tiempo constante). Deduplica por `$event['id']`.
