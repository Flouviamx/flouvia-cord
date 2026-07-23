---
title: "API de Clientes"
description: "Sincroniza y administra el directorio de clientes desde tus sistemas contables."
---

<header class="content-header">
  <h1 class="page-title">Clientes</h1>
  <p class="page-subtitle">Sincroniza tu base de datos de organizaciones y prospectos comerciales.</p>
</header>

## Descripción General

El objeto `Cliente` contiene el registro maestro comercial de las personas u organizaciones a las que les facturas. Sincronizar clientes a través de la API es la base para mantener a Cord perfectamente alineado con tu ERP o CRM (como Salesforce o HubSpot).

## Crear un Cliente

Crea un nuevo cliente enviando un `POST /v1/clientes`. El único campo estrictamente obligatorio es el nombre de la `empresa`, pero se recomienda incluir el RFC y las condiciones de crédito (`limite`, `terminos`).

**Petición:**

```bash
curl -X POST "https://api.cordhq.com/v1/clientes" \
     -H "Authorization: Bearer sk_live_tU..." \
     -H "Content-Type: application/json" \
     -d '{
       "empresa": "Stark Industries",
       "contacto": "Tony Stark",
       "email": "tony@stark.com",
       "rfc": "STA120412XYZ",
       "terminos": "net30",
       "limite": 500000,
       "nivel": "oro",
       "descuento_pct": 15
     }'
```

**Respuesta Exitosa:**

```json
{
  "data": {
    "id": "cus_8f7b2c..."
  }
}
```

### Reglas de Negocio Automatizadas

Cuando creas clientes vía API, Cord aplica restricciones lógicas en tiempo real:
- Los términos de pago (`terminos`) deben ser válidos (`contado`, `net30`, `net60`). Si pasas algo inválido, recae por defecto a `contado`.
- El nivel de alianza (`nivel`) está restringido a `estandar`, `plata`, `oro`, o `distribuidor`.
- El RFC es formateado y normalizado a mayúsculas automáticamente.
- El descuento (`descuento_pct`) está limitado matemáticamente entre 0 y 100.

## Listar Clientes

Recupera el catálogo completo usando [Paginación](/docs/desarrolladores/esenciales/paginacion).

```bash
curl -X GET "https://api.cordhq.com/v1/clientes?limit=100" \
     -H "Authorization: Bearer sk_live_tU..."
```
