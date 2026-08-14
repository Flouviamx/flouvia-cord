# Cord — entrada para agentes

Este archivo es el adaptador de instrucciones para agentes que usan `AGENTS.md`.
El índice operativo completo y el mapa de lectura viven en [`CLAUDE.md`](CLAUDE.md);
la documentación canónica, en [`docs/README.md`](docs/README.md).

## Protocolo

1. Lee los dos documentos base importados al final.
2. Usa `docs/README.md` para abrir solo el estado actual del dominio en alcance.
3. Consulta `docs/historial.md` y su historial temático solo cuando necesites
   contexto cronológico.
4. Código, `db/schema.sql`, `package.json` y `.env.example` tienen prioridad para
   hechos operativos que puedan haber cambiado.
5. Conserva cambios locales ajenos a tu tarea.

No agregues reglas, arquitectura, features, variables ni changelog a este archivo.
Mantén las reglas permanentes en `docs/estandares-ingenieria.md`, el estado actual
en el documento temático y cada decisión fechada en un solo historial.

## Contexto base importado

@docs/proyecto.md
@docs/estandares-ingenieria.md
