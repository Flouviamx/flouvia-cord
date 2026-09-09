---
title: "Por qué conectamos Cord a Claude vía MCP"
excerpt: "Así funciona nuestra arquitectura bidireccional de agentes. Cómo el Model Context Protocol convierte a los LLMs en operadores de tu software."
category: "Tecnología"
date: "02 May 2026"
readTime: "12 MIN"
img: "/images/blog/mcp-agentes-ia.png"
authorName: "Equipo Cord"
authorRole: "Ingeniería de producto"
---

Durante la primera ola de la Inteligencia Artificial Generativa (2023-2024), casi todas las plataformas B2B cometieron el mismo error: agregaron un "Chatbot" flotante en la esquina inferior derecha de su software.

La promesa era que le pudieras preguntar a la IA sobre tus datos. La realidad es que estos sistemas eran *silos de solo lectura*. Podías preguntar "¿Cuánto vendimos este mes?", pero no podías decirle "Crea una cotización para el cliente X, aplícale un 10% de descuento y envíasela por correo".

Para lograr la verdadera autonomía, la IA necesita **manos**. Necesita la capacidad de ejecutar acciones reales en el sistema, exactamente como lo haría un usuario humano. Y ahí es donde entra en juego el **Model Context Protocol (MCP)** desarrollado inicialmente por Anthropic (creadores de Claude).

## ¿Qué es el Model Context Protocol (MCP)?

El MCP es a los Modelos de Lenguaje lo que los puertos USB son a las computadoras. Es un estándar abierto y seguro que permite que un modelo de IA se conecte de manera estandarizada a cualquier fuente de datos o aplicación externa.

En lugar de construir costosas integraciones API ad-hoc y *plugins* frágiles para cada plataforma (Salesforce, SAP, Notion, Cord), expones un "Servidor MCP". 

Claude (o cualquier otro agente compatible) se conecta a este servidor y descubre instantáneamente un catálogo de "Herramientas" (Tools) y "Recursos" (Resources) que puede utilizar.

## La Arquitectura Bidireccional de Cord

En **Cord**, decidimos adoptar MCP como el puente definitivo entre la inteligencia de Claude y nuestra infraestructura de flujos de pago B2B. No construimos un chatbot; construimos un conjunto de primitivas operativas.

### Cómo funcionan nuestras MCP Tools

Cuando conectas un cliente MCP compatible a Cord, el modelo solo ve las herramientas permitidas por la llave API y la organización activa. No recibe acceso directo a la base de datos.

1. **`crear_cotizacion_borrador`:** crea un borrador con cliente y partidas válidas. No lo envía al cliente.
2. **`cartera_vencida` y `resumen_negocio`:** consultan hechos operativos dentro del alcance de lectura de la llave.
3. **`buscar_cliente`, `listar_productos`, `listar_cotizaciones` y `listar_facturas`:** permiten encontrar entidades antes de proponer una acción.

> "El futuro del software B2B no es tener mejores interfaces gráficas (GUIs), es tener APIs semánticas perfectas para que los Agentes de IA operen la infraestructura por nosotros."

## Seguridad en el Ecosistema MCP

La gran preocupación de los CFOs y CTOs al darle "manos" a la IA es la seguridad. ¿Qué pasa si el modelo "alucina" y borra una lista de precios o envía una factura con un 90% de descuento?

El estándar MCP y la implementación en Cord resuelven esto mediante el principio de **Human-in-the-Loop (HITL)** para acciones destructivas o de alto impacto.

Cord no expone actualmente una herramienta MCP para enviar la cotización ni para actualizar listas de precios en masa. La herramienta de escritura disponible crea un borrador y admite una clave de idempotencia para evitar duplicados accidentales. La confirmación adicional que muestre el cliente MCP depende de ese cliente; no debe describirse como una barrera que el servidor de Cord siempre impone.

La seguridad real combina llave secreta, scopes, aislamiento por organización, validación de argumentos, límites y auditoría. Después de crear el borrador, una persona debe revisarlo y enviarlo desde el flujo autorizado.

## El Futuro de las Operaciones

Al integrar MCP, Cord deja de ser simplemente un software de gestión de cotizaciones y facturas. Se convierte en un **motor de infraestructura autónomo**. 

En 2026, los equipos de operaciones más eficientes no son los que teclean más rápido, sino los que dirigen orquestas de Agentes de IA a través de protocolos seguros y estandarizados. Y Cord está construido precisamente para esta era.
