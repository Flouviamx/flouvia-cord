<?php

declare(strict_types=1);

// Pruebas sin dependencias: php tests/run.php
require __DIR__ . '/../src/CordException.php';
require __DIR__ . '/../src/WebhookSignatureException.php';
require __DIR__ . '/../src/Webhook.php';
require __DIR__ . '/../src/ApiResource.php';
require __DIR__ . '/../src/TestHelpers.php';
require __DIR__ . '/../src/Cord.php';

use Flouvia\Cord\Cord;
use Flouvia\Cord\CordException;
use Flouvia\Cord\Webhook;
use Flouvia\Cord\WebhookSignatureException;

$failures = 0;
function check(string $name, bool $ok): void
{
    global $failures;
    echo ($ok ? 'ok   ' : 'FAIL ') . $name . PHP_EOL;
    if (!$ok) $failures++;
}

function fake(array &$calls, array $responses): callable
{
    return function (string $method, string $url, array $headers, ?string $body) use (&$calls, &$responses) {
        $calls[] = [$method, $url, $headers, $body];
        [$status, $payload, $extra] = array_shift($responses);
        return [$status, $extra, json_encode($payload)];
    };
}

try { new Cord('pk_live_x'); check('rechaza pk_', false); } catch (InvalidArgumentException) { check('rechaza pk_', true); }

$calls = [];
$cord = new Cord('sk_test_x', ['max_retries' => 1, 'transport' => fake($calls, [[502, ['error' => 'x'], ['Retry-After' => '0']], [200, ['data' => ['folio' => 'COT-1']], []]])]);
$quote = $cord->quotes->create(['items' => [['descripcion' => 'X', 'cantidad' => 1, 'precio_unitario' => 1]]]);
check('reintenta y crea', $quote['folio'] === 'COT-1');
check('misma Idempotency-Key en el reintento', $calls[0][2]['Idempotency-Key'] === $calls[1][2]['Idempotency-Key']);
check('manda Cord-Version', $calls[0][2]['Cord-Version'] === '2026-10-01');

$calls = [];
$cord = new Cord('sk_test_x', ['transport' => fake($calls, [[404, ['error' => 'No', 'code' => 'not_found'], ['Cord-Request-Id' => 'req_9']]])]);
try { $cord->quotes->retrieve('abc'); check('error tipado', false); } catch (CordException $e) {
    check('error tipado', $e->status === 404 && $e->errorCode === 'not_found' && $e->requestId === 'req_9');
}
check('sin Idempotency-Key en lecturas', !isset($calls[0][2]['Idempotency-Key']));

$calls = [];
$cord = new Cord('sk_test_x', ['transport' => fake($calls, [
    [200, ['data' => [['id' => 1], ['id' => 2]], 'meta' => ['total' => 3]], []],
    [200, ['data' => [['id' => 3]], 'meta' => ['total' => 3]], []],
    [200, ['data' => [['id' => 'a']], 'meta' => ['next_cursor' => 'c1']], []],
    [200, ['data' => [['id' => 'b']], 'meta' => ['next_cursor' => null]], []],
])]);
check('autopagina por offset', array_column(iterator_to_array($cord->clients->listAll(), false), 'id') === [1, 2, 3]);
check('autopagina por cursor', array_column(iterator_to_array($cord->invoices->listAll(), false), 'id') === ['a', 'b']);

try { (new Cord('sk_live_x', ['transport' => fake($calls, [])]))->testHelpers->triggerWebhook('quote.paid'); check('testHelpers exige sk_test_', false); }
catch (LogicException) { check('testHelpers exige sk_test_', true); }

$secret = 'whsec_test';
$body = json_encode(['id' => 'evt_1', 'event' => 'invoice.paid', 'created_at' => 'x', 'data' => ['id' => 'i1']]);
$now = 1790000000;
check('firma V1 válida', Webhook::constructEvent($body, ['X-Cord-Signature-V1' => Webhook::signPayload($body, $secret, $now)], $secret, now: $now)['event'] === 'invoice.paid');
$good = explode(',', Webhook::signPayload($body, $secret, $now))[1];
check('rotación: basta una firma', Webhook::constructEvent($body, ['x-cord-signature-v1' => "t={$now},v1=" . str_repeat('0', 64) . ",{$good}"], $secret, now: $now)['id'] === 'evt_1');

$cases = [
    'timestamp_out_of_tolerance' => ['x-cord-signature-v1' => Webhook::signPayload($body, $secret, $now - 301)],
    'signature_mismatch' => ['x-cord-signature-v1' => Webhook::signPayload($body, 'otro', $now)],
    'invalid_signature_header' => ['x-cord-signature-v1' => 'basura'],
    'missing_signature' => [],
    'legacy_signature_rejected' => ['x-cord-signature' => 'sha256=' . str_repeat('a', 64)],
];
foreach ($cases as $reason => $headers) {
    try { Webhook::constructEvent($body, $headers, $secret, now: $now); check("rechaza {$reason}", false); }
    catch (WebhookSignatureException $e) { check("rechaza {$reason}", $e->reason === $reason); }
}
try { Webhook::constructEvent(str_replace('i1', 'i2', $body), ['x-cord-signature-v1' => Webhook::signPayload($body, $secret, $now)], $secret, now: $now); check('cuerpo alterado', false); }
catch (WebhookSignatureException $e) { check('cuerpo alterado', $e->reason === 'signature_mismatch'); }

exit($failures ? 1 : 0);
