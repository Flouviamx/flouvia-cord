<?php

declare(strict_types=1);

namespace Flouvia\Cord;

/** Simuladores del modo prueba. Solo con una llave sk_test_. */
final class TestHelpers
{
    public function __construct(private readonly Cord $cord)
    {
    }

    private function check(): void
    {
        if ($this->cord->mode !== 'test') {
            throw new \LogicException('testHelpers solo funciona con una llave de prueba (sk_test_).');
        }
    }

    public function setNextFiscalOutcome(string $resultado): array
    {
        $this->check();
        return $this->cord->request('POST', '/test_helpers/fiscal', [], ['siguiente_resultado' => $resultado])[0];
    }

    public function viewQuote(string $id): array
    {
        $this->check();
        return $this->cord->request('POST', '/test_helpers/cotizaciones/' . rawurlencode($id), [], ['accion' => 'vista'])[0];
    }

    public function expireQuote(string $id): array
    {
        $this->check();
        return $this->cord->request('POST', '/test_helpers/cotizaciones/' . rawurlencode($id), [], ['accion' => 'vencer'])[0];
    }

    public function triggerWebhook(string $evento, ?string $objetoId = null): array
    {
        $this->check();
        return $this->cord->request('POST', '/test_helpers/webhooks', [], array_filter(['evento' => $evento, 'objeto_id' => $objetoId]))[0];
    }
}
