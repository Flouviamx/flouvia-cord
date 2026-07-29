// Prompt de integración que el botón "Generar prompt" del Workbench copia al
// portapapeles (Ajustes › Developers → pestaña API). Vivía embebido en el
// `<script>` del fragmento `/app/wb/[tab].astro`; se extrajo aquí al mover todo
// el JS al chasis, para no cargar 30 líneas de texto dentro del controlador.

export const DEV_INTEGRATION_PROMPT = `Eres un Desarrollador Backend Senior (experto en TypeScript, Node.js y frameworks modernos como Next.js).
Tu tarea es implementar la integración con la API REST de Flouvia Cord (un SaaS B2B) para mi aplicación.

== CONTEXTO TÉCNICO ==
- Base URL: https://cordhq.app/api/v1
- Autenticación: Header "Authorization: Bearer <TU_API_KEY>"
- Content-Type: application/json

== REQUERIMIENTO ==
Crea el código necesario para automatizar la creación de una cotización cuando un usuario realiza una acción en mi aplicación (por ejemplo, enviar un formulario B2B).
Debes estructurar el código siguiendo las mejores prácticas: separación de responsabilidades, manejo de errores de red (try/catch), y validación de variables de entorno.
IMPORTANTE: Si estoy usando Next.js App Router, implementa esto como un Server Action (o Route Handler) para jamás exponer la API Key en el lado del cliente (browser).

== ESQUEMA DEL ENDPOINT (POST /cotizaciones) ==
El endpoint de Cord requiere este JSON de forma estricta:
{
  "send": boolean, // (Opcional) Si es true, la cotización se aprueba y se genera un link público inmediatamente. Si es false, se queda como borrador.
  "notas": string, // (Opcional) Campo de texto libre para uso interno o volcar detalles de un formulario.
  "cliente_id": string, // (Opcional) UUID del cliente si ya existe en el directorio de Cord.
  "items": [ // (OBLIGATORIO) Array con al menos 1 producto/servicio
    {
      "descripcion": string, // (Obligatorio) Nombre del concepto (ej. "Solicitud Cotización Web")
      "cantidad": number, // (Obligatorio)
      "precio_unitario": number // (Obligatorio) Precio en la moneda base. Puedes mandar 0 si se negociará después por un vendedor.
    }
  ]
}

== SALIDA ESPERADA ==
- Escribe la función de integración (ej. \`src/actions/cord.ts\`).
- Incluye comentarios sobre cómo llamar a esta función de manera segura desde mi frontend.`;
