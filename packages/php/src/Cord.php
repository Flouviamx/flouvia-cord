<?php

declare(strict_types=1);

namespace Flouvia\Cord;

/**
 * Cliente de la API v1 de Cord.
 *
 *   $cord = new Cord(getenv('CORD_SECRET_KEY'));
 *   $quote = $cord->quotes->create(['cliente' => ['empresa' => 'Acme'], 'items' => [...]]);
 */
final class Cord
{
    public const API_VERSION = '2026-10-01';
    public const SDK_VERSION = '1.0.0';
    private const RETRYABLE = [408, 425, 429, 500, 502, 503, 504];

    public readonly string $mode;
    public readonly ApiResource $quotes;
    public readonly ApiResource $clients;
    public readonly ApiResource $products;
    public readonly ApiResource $invoices;
    public readonly ApiResource $events;
    public readonly ApiResource $webhookEndpoints;
    public readonly TestHelpers $testHelpers;

    private string $base;
    /** @var callable(string, string, array<string,string>, ?string, float): array{0:int,1:array<string,string>,2:string} */
    private $transport;

    /**
     * @param array{base_url?: string, api_version?: string, timeout?: float, max_retries?: int, transport?: callable} $options
     */
    public function __construct(private readonly string $apiKey, private readonly array $options = [])
    {
        if ($apiKey === '') {
            throw new \InvalidArgumentException('Falta la API key (sk_live_… o sk_test_…).');
        }
        if (str_starts_with($apiKey, 'pk_')) {
            throw new \InvalidArgumentException('El SDK de servidor usa una secret key (sk_). La pk_ es para el navegador.');
        }
        $this->mode = str_starts_with($apiKey, 'sk_test_') ? 'test' : 'live';
        $this->base = rtrim($options['base_url'] ?? 'https://cordhq.app', '/') . '/api/v1';
        $this->transport = $options['transport'] ?? [self::class, 'curlTransport'];

        $this->quotes = new ApiResource($this, '/cotizaciones', 'offset', ['send', 'resend', 'approve', 'reject', 'mark_paid']);
        $this->clients = new ApiResource($this, '/clientes', 'offset');
        $this->products = new ApiResource($this, '/productos', 'offset');
        $this->invoices = new ApiResource($this, '/facturas', 'cursor', ['finalize', 'send', 'void', 'payment', 'credit_note']);
        $this->events = new ApiResource($this, '/events', 'cursor');
        $this->webhookEndpoints = new ApiResource($this, '/webhooks', null);
        $this->testHelpers = new TestHelpers($this);
    }

    public function me(): array
    {
        return $this->request('GET', '/me')[0];
    }

    public function collections(): array
    {
        return $this->request('GET', '/cobranza')[0];
    }

    /**
     * @return array{0: mixed, 1: ?array} data y meta
     */
    public function request(string $method, string $path, array $query = [], ?array $body = null, ?string $idempotencyKey = null): array
    {
        $url = $this->base . $path;
        $query = array_filter($query, fn ($v) => $v !== null && $v !== '');
        if ($query) {
            $url .= '?' . http_build_query($query);
        }
        $headers = [
            'Authorization' => "Bearer {$this->apiKey}",
            'Accept' => 'application/json',
            'Cord-Version' => $this->options['api_version'] ?? self::API_VERSION,
            'User-Agent' => 'cord-php/' . self::SDK_VERSION,
        ];
        $payload = null;
        if ($body !== null) {
            $headers['Content-Type'] = 'application/json';
            $payload = json_encode($body, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        }
        // Toda mutación lleva clave, la misma en cada reintento: nunca duplica.
        if ($method !== 'GET') {
            $headers['Idempotency-Key'] = $idempotencyKey ?? self::uuid();
        }

        $maxRetries = max(0, min(5, (int) ($this->options['max_retries'] ?? 2)));
        $timeout = (float) ($this->options['timeout'] ?? 30.0);
        for ($attempt = 0; ; $attempt++) {
            try {
                [$status, $resHeaders, $raw] = ($this->transport)($method, $url, $headers, $payload, $timeout);
            } catch (\Throwable $e) {
                if ($attempt < $maxRetries) {
                    usleep((int) (self::backoff($attempt) * 1e6));
                    continue;
                }
                throw new CordException(0, ['error' => 'No se pudo contactar a Cord: ' . $e->getMessage()]);
            }
            $parsed = $raw === '' ? [] : json_decode($raw, true);
            $parsed = is_array($parsed) ? $parsed : ['error' => substr($raw, 0, 200)];
            $lower = array_change_key_case($resHeaders, CASE_LOWER);
            if ($status >= 200 && $status < 300) {
                return [$parsed['data'] ?? null, $parsed['meta'] ?? null];
            }
            $retryable = in_array($status, self::RETRYABLE, true) || ($status === 409 && ($parsed['code'] ?? '') === 'idempotency_in_progress');
            if ($retryable && $attempt < $maxRetries) {
                $after = (float) ($lower['retry-after'] ?? 0);
                usleep((int) (($after > 0 ? min($after, 60) : self::backoff($attempt)) * 1e6));
                continue;
            }
            throw new CordException($status, $parsed, $lower['cord-request-id'] ?? null);
        }
    }

    /** @return array{0:int,1:array<string,string>,2:string} */
    public static function curlTransport(string $method, string $url, array $headers, ?string $body, float $timeout): array
    {
        $ch = curl_init($url);
        $resHeaders = [];
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT_MS => (int) ($timeout * 1000),
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HTTPHEADER => array_map(fn ($k, $v) => "{$k}: {$v}", array_keys($headers), $headers),
            CURLOPT_HEADERFUNCTION => function ($curl, string $line) use (&$resHeaders) {
                $parts = explode(':', $line, 2);
                if (count($parts) === 2) {
                    $resHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
                }
                return strlen($line);
            },
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $raw = curl_exec($ch);
        if ($raw === false) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new \RuntimeException($error);
        }
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return [$status, $resHeaders, (string) $raw];
    }

    private static function backoff(int $attempt): float
    {
        $base = min(10.0, 0.5 * (2 ** $attempt));
        return $base / 2 + (mt_rand() / mt_getrandmax()) * $base / 2;
    }

    private static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
