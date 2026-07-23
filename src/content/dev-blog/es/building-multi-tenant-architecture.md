---
title: "Construyendo una arquitectura multi-tenant de alto rendimiento"
date: "2026.07.23"
type: "BLOG"
topic: "Engineering"
authors:
  - "ANDRÉ VALLE"
  - "CORD ENG"
readTime: "8 MIN"
---
A las 2 a.m. de un martes, suena el busca de un ingeniero de guardia. Un shard de base de datos, uno de los 2000 que procesaron colectivamente 1.9 billones de dólares en pagos en 2025, ha entrado en estado degradado. Dos nodos están caídos, y un tercero está bloqueando la construcción de un índice debido a un voto mal configurado.

Este escenario se repitió cientos de veces al año en nuestra flota de bases de datos. La explosión combinatoria de los modos de fallo hizo imposible anticipar cada escenario con automatización estática y codificada manualmente. Necesitábamos un enfoque fundamentalmente diferente.

## Por qué la automatización estática se rompe a escala

Nuestro sistema original de auto-remediación operaba como una máquina de estados de un solo paso, codificada rígidamente. Un conjunto de plugins, cada uno responsable de un problema como 'arreglar votos', 'arreglar prioridad' o 'reconstruir nodo caído', se ejecutaba en una secuencia cuidadosamente ordenada basada en clasificaciones.

Esto funcionaba bien para casos simples, como si un solo nodo se caía, o uno o dos votos mal configurados, pero tenía limitaciones fundamentales:

- Las dependencias implícitas entre los plugins significaban que el ordenamiento era frágil. Los plugins de "arreglar votos" requerían que no hubiera nodos caídos, pero tenían mayor prioridad.
- Los escenarios de múltiples fallos exponían puntos ciegos. Cuando múltiples nodos afectados se combinaban con particiones de red, la lógica estática entraba en un bucle infinito.

## El salto a Postgres Serverless con Neon

Para solucionar esto, migramos nuestra capa de enrutamiento principal a Postgres Serverless de Neon. En lugar de gestionar fragmentos físicos (shards) y lidiar con el reequilibrio manual, aprovechamos la separación de almacenamiento y cómputo de Neon.

Esto nos permitió construir una verdadera arquitectura multi-tenant usando dos conceptos clave:

### 1. Seguridad a Nivel de Fila (RLS) para el aislamiento de Inquilinos
En lugar de aprovisionar una nueva base de datos para cada cliente (lo que escala mal y aumenta los costos de infraestructura), agrupamos a los inquilinos en bases de datos compartidas. Imponemos un estricto aislamiento de datos utilizando la Seguridad a Nivel de Fila de Postgres (RLS).

Cada consulta ejecutada por nuestra API está envuelta en una transacción que establece una variable local para el `tenant_id`. Postgres automáticamente añade `WHERE tenant_id = current_setting('app.current_tenant')` a cada lectura y escritura. Incluso si hay un error en la lógica de nuestra aplicación, un inquilino no puede ver los datos de otro.

### 2. Agrupación de conexiones en el Edge (Connection Pooling)
Un gran desafío con Postgres es el agotamiento de las conexiones. Si 5,000 inquilinos se conectan simultáneamente, Postgres fallará. Solucionamos esto implementando PgBouncer en el borde, escalándolo en múltiples regiones y enrutando dinámicamente las consultas a los puntos finales de cómputo de Neon.

## El Resultado

Al migrar a esta arquitectura, redujimos el volumen de alertas en nuestro buscapersonas en un 92%. Ya no nos despertamos de madrugada para arreglar shards rotos porque el cómputo escala instantáneamente según la carga, y el almacenamiento se gestiona de forma transparente por el proveedor de la nube. Ahora podemos incorporar a 10,000 nuevos inquilinos sin modificar una sola pieza de infraestructura.
