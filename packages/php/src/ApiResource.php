<?php

declare(strict_types=1);

namespace Flouvia\Cord;

/** Recurso de la API: list, listAll, retrieve, create, update, delete y acciones. */
final class ApiResource
{
    /** @param list<string> $actions */
    public function __construct(private readonly Cord $cord, private readonly string $path, private readonly ?string $paging, private readonly array $actions = [])
    {
    }

    public function list(array $params = []): array
    {
        [$data, $meta] = $this->cord->request('GET', $this->path, $params);
        return ['data' => $data ?? [], 'meta' => $meta ?? []];
    }

    /** Recorre todas las páginas. */
    public function listAll(array $params = []): \Generator
    {
        if ($this->paging === 'cursor') {
            $cursor = null;
            do {
                $page = $this->list($params + ['limit' => 200, 'cursor' => $cursor]);
                yield from $page['data'];
                $cursor = $page['meta']['next_cursor'] ?? null;
            } while ($cursor);
            return;
        }
        $offset = 0;
        do {
            $page = $this->list($params + ['limit' => 200, 'offset' => $offset]);
            yield from $page['data'];
            $offset += count($page['data']);
        } while ($page['data'] && $offset < (int) ($page['meta']['total'] ?? 0));
    }

    public function retrieve(string $id): array
    {
        return $this->cord->request('GET', $this->path . '/' . rawurlencode($id))[0];
    }

    public function create(array $params, ?string $idempotencyKey = null): array
    {
        return $this->cord->request('POST', $this->path, [], $params, $idempotencyKey)[0];
    }

    public function update(string $id, array $params, ?string $idempotencyKey = null): array
    {
        return $this->cord->request('PATCH', $this->path . '/' . rawurlencode($id), [], $params, $idempotencyKey)[0];
    }

    public function delete(string $id): array
    {
        return $this->cord->request('DELETE', $this->path . '/' . rawurlencode($id))[0];
    }

    /** Acciones del recurso: send, approve, finalize, payment… Importe y divisa siempre juntos. */
    public function action(string $id, string $action, array $params = [], ?string $idempotencyKey = null): array
    {
        if (!in_array($action, $this->actions, true)) {
            throw new \InvalidArgumentException("Acción no disponible: {$action}");
        }
        return $this->cord->request('POST', $this->path . '/' . rawurlencode($id), [], ['action' => $action] + $params, $idempotencyKey)[0];
    }
}
