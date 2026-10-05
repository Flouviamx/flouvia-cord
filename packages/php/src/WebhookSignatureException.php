<?php

declare(strict_types=1);

namespace Flouvia\Cord;

/** La entrega no es auténtica; `reason` dice por qué. */
final class WebhookSignatureException extends \RuntimeException
{
    public function __construct(public readonly string $reason, string $message)
    {
        parent::__construct($message);
    }
}
