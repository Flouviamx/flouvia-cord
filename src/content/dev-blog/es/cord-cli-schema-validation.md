---
title: "Cord CLI 2.0: Validación de esquemas instantánea"
date: "2026.07.20"
type: "DOCS"
topic: "Engineering"
authors:
  - "CORD ENG"
readTime: "5 MIN"
---
La experiencia del desarrollador es crítica para una iteración rápida. Con Cord CLI 2.0, los desarrolladores ahora pueden aprovechar la validación instantánea y local de esquemas directamente en su flujo de trabajo, atrapando errores antes de que toquen la red.

## El problema con la validación del lado del servidor

Históricamente, al subir una configuración o desplegar una función serverless, la validación ocurría del lado del servidor. Ejecutabas un comando de despliegue, esperabas a que el payload se cargara, solo para recibir un críptico error "400 Bad Request" por un error tipográfico en una variable de entorno o una versión de ejecución incompatible.

Este ciclo de retroalimentación es simplemente demasiado lento para el desarrollo moderno.

## Validación local con JSON Schemas

Cord CLI 2.0 aprovecha fuertemente JSON Schema y WebAssembly (Wasm) para realizar una validación estricta directamente en tu máquina.

Cuando ejecutas `cord deploy`, la CLI cruza instantáneamente tu archivo `cord.config.ts` o `cord.json` con el esquema de plataforma unificado.

```bash
$ cord deploy

❌ Error en cord.config.ts
Línea 14: Propiedad inválida 'memory_limit'. 
Se esperaba una de: [128, 256, 512, 1024]. Se recibió: 300.
```

Debido a que la CLI está construida en Rust utilizando la caja (crate) `jsonschema`, esta validación local toma menos de 2 milisegundos, permitiéndote iterar al instante.

## Integración con el Editor

Esta lógica de validación también está integrada directamente con el Language Server Protocol (LSP). Si usas VS Code, Cursor o Neovim, obtienes autocompletado en tiempo real, verificación de tipos y documentación al pasar el cursor (hover) para todos tus archivos de configuración de Cord de inmediato.

Simplemente añade la referencia del esquema a tu archivo JSON:

```json
{
  "$schema": "https://schema.cord.com/v2/config.json",
  "project": "my-awesome-app"
}
```

Esto reduce drásticamente el tiempo dedicado a revisar documentación y asegura que atrapes malas configuraciones antes de siquiera guardar el archivo. Empieza a validar localmente hoy ejecutando `npm install -g @cord/cli@latest`.
