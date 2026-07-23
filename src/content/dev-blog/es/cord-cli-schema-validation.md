---
title: "Cord CLI 2.0: Validación de esquemas instantánea"
date: "2026.07.20"
type: "DOCS"
topic: "Engineering"
authors:
  - "CORD ENG"
readTime: "5 MIN"
---
La experiencia del desarrollador está en el núcleo de todo lo que construimos en Cord. Hoy estamos emocionados de anunciar Cord CLI 2.0, reescrito completamente en Rust, que trae validación instantánea y local de esquemas a tu flujo de trabajo de desarrollo.

## El problema con la validación del lado del servidor

Históricamente, cuando subías una configuración o desplegabas una función sin servidor utilizando el Cord CLI, la validación ocurría en el lado del servidor. Ejecutabas `cord deploy`, esperabas 4-5 segundos a que el payload se cargara, solo para recibir un críptico error "400 Bad Request" porque te equivocaste en el nombre de una variable de entorno o usaste una versión de tiempo de ejecución de Node.js incompatible.

Este ciclo de retroalimentación es simplemente demasiado lento para el desarrollo moderno.

## Validación local con JSON Schemas

Con Cord CLI 2.0, estamos aprovechando fuertemente JSON Schema y WebAssembly (Wasm) para realizar una validación estricta directamente en tu máquina antes de que un solo byte toque la red.

Cuando ejecutas `cord deploy`, la CLI cruza instantáneamente tu archivo `cord.config.ts` o `cord.json` con nuestro esquema de plataforma unificado.

```bash
$ cord deploy

❌ Error en cord.config.ts
Línea 14: Propiedad inválida 'memory_limit'. 
Se esperaba una de: [128, 256, 512, 1024]. Se recibió: 300.
```

Debido a que la CLI está construida en Rust utilizando la caja (crate) `jsonschema`, esta validación toma menos de 2 milisegundos.

## Integración con el Editor

No nos detuvimos en la CLI. Al estandarizar nuestra lógica de validación en torno a JSON Schema, nos hemos integrado directamente con el Language Server Protocol (LSP). Si usas VS Code, Cursor o Neovim, ahora obtienes autocompletado en tiempo real, verificación de tipos y documentación al pasar el cursor (hover) para todos tus archivos de configuración de Cord.

Simplemente añade la referencia del esquema a tu archivo JSON:

```json
{
  "$schema": "https://schema.cord.com/v2/config.json",
  "project": "my-awesome-app"
}
```

Esto reduce drásticamente el tiempo dedicado a revisar documentación y asegura que atrapes malas configuraciones antes de siquiera guardar el archivo.
