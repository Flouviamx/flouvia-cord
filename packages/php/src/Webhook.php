<?php

declare(strict_types=1);

namespace Flouvia\Cord;

/**
 * Verificación de webhooks de Cord. Exige X-Cord-Signature-V1 (con timestamp):
 * sin él una entrega capturada se podría reenviar para siempre. La firma legacy
 * solo se acepta con $allowLegacySignature.
 */
final class Webhook
{
    /**
     * @param string $payload Cuerpo CRUDO (file_get_contents('php://input') o $request->getContent()).
     * @param array<string, string|string[]> $headers
     * @return array<string, mixed>
     */
    public static function constructEvent(string $payload, array $headers, string $secret, int $tolerance = 300, bool $allowLegacySignature = false, ?int $now = null): array
    {
        if ($secret === '') {
            throw new WebhookSignatureException('missing_signature', 'Falta el secreto del endpoint.');
        }
        $now ??= time();
        $v1 = self::header($headers, 'x-cord-signature-v1');

        if ($v1 !== null) {
            $timestamp = null;
            $signatures = [];
            foreach (explode(',', $v1) as $part) {
                [$key, $value] = array_pad(explode('=', trim($part), 2), 2, '');
                if ($key === 't' && ctype_digit($value) && strlen($value) <= 12) {
                    $timestamp = (int) $value;
                } elseif ($key === 'v1' && preg_match('/^[0-9a-f]{64}$/i', $value)) {
                    $signatures[] = strtolower($value);
                }
            }
            if ($timestamp === null || $signatures === []) {
                throw new WebhookSignatureException('invalid_signature_header', 'X-Cord-Signature-V1 no tiene el formato t=<unix>,v1=<hex>.');
            }
            if (abs($now - $timestamp) > $tolerance) {
                throw new WebhookSignatureException('timestamp_out_of_tolerance', 'La firma está fuera de la ventana de tolerancia: posible reenvío.');
            }
            $expected = hash_hmac('sha256', "{$timestamp}.{$payload}", $secret);
            foreach ($signatures as $signature) {
                if (hash_equals($expected, $signature)) {
                    return self::parse($payload);
                }
            }
            throw new WebhookSignatureException('signature_mismatch', 'La firma no corresponde a este secreto.');
        }

        $legacy = self::header($headers, 'x-cord-signature');
        if ($legacy === null) {
            throw new WebhookSignatureException('missing_signature', 'La entrega no trae firma de Cord.');
        }
        if (!$allowLegacySignature) {
            throw new WebhookSignatureException('legacy_signature_rejected', 'Solo llegó la firma legacy (sin timestamp).');
        }
        $signature = strtolower(preg_replace('/^sha256=/i', '', trim($legacy)));
        if (!preg_match('/^[0-9a-f]{64}$/', $signature)) {
            throw new WebhookSignatureException('invalid_signature_header', 'X-Cord-Signature no tiene el formato sha256=<hex>.');
        }
        if (!hash_equals(hash_hmac('sha256', $payload, $secret), $signature)) {
            throw new WebhookSignatureException('signature_mismatch', 'La firma no corresponde a este secreto.');
        }
        return self::parse($payload);
    }

    /** Firma un cuerpo como lo hace Cord. Útil en tus pruebas. */
    public static function signPayload(string $payload, string $secret, ?int $timestamp = null): string
    {
        $timestamp ??= time();
        return "t={$timestamp},v1=" . hash_hmac('sha256', "{$timestamp}.{$payload}", $secret);
    }

    private static function header(array $headers, string $name): ?string
    {
        foreach ($headers as $key => $value) {
            if (strtolower((string) $key) === $name) {
                return is_array($value) ? (isset($value[0]) ? (string) $value[0] : null) : (string) $value;
            }
        }
        return null;
    }

    private static function parse(string $payload): array
    {
        $event = json_decode($payload, true);
        if (!is_array($event) || !is_string($event['id'] ?? null) || !is_string($event['event'] ?? null) || !is_array($event['data'] ?? null)) {
            throw new WebhookSignatureException('invalid_payload', 'El cuerpo no tiene la forma { id, event, created_at, data }.');
        }
        return $event;
    }
}
