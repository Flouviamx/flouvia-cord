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
