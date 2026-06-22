---
title: "[EN] Catálogo de clientes y RFC"
description: "Gestión y validación de RFCs en la lista de clientes."
category: "Billing & CFDI"
---

El manejo de clientes en Cord está pensado para evitar rechazos del SAT al emitir CFDI 4.0.

### Validación en tiempo real (CFDI 4.0)

En la versión 4.0 del CFDI, el Nombre/Razón Social y el Código Postal deben coincidir letra por letra con la Constancia de Situación Fiscal (CSF) del cliente.
Cuando añades un cliente en Cord:
1. El sistema valida el Código Postal contra el listado oficial del SAT.
2. Si la Razón Social incluye el régimen societario (ej. "ACME S.A. DE C.V."), Cord lo **limpiará automáticamente** a "ACME", ya que el SAT rechaza facturas que incluyen el "SA de CV".

**Tip de importación masiva:** Si vienes de otro sistema, usa nuestra herramienta de importación por CSV. Asegúrate de que las columnas de Nombre y Código Postal vengan directamente de la CSF de tus clientes para evitar bloqueos operativos futuros.
