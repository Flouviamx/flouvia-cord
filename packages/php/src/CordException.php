<?php

declare(strict_types=1);

namespace Flouvia\Cord;

/** Error de la API: `code` estable, `requestId` para soporte y `docUrl`. */
final class CordException extends \RuntimeException
{
    public readonly int $status;
    public readonly string $errorCode;
    public readonly ?string $requestId;
    public readonly ?string $docUrl;
    public readonly array $body;

    public function __construct(int $status, array $body, ?string $requestId = null)
    {
        parent::__construct(is_string($body['error'] ?? null) ? $body['error'] : "Cord API error ({$status})");
        $this->status = $status;
        $this->errorCode = is_string($body['code'] ?? null) ? $body['code'] : ($status === 0 ? 'network_error' : 'unknown');
        $this->requestId = $requestId ?? (is_string($body['request_id'] ?? null) ? $body['request_id'] : null);
        $this->docUrl = is_string($body['doc_url'] ?? null) ? $body['doc_url'] : null;
        $this->body = $body;
    }
}
