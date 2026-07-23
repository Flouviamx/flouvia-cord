---
title: "Datos del cliente"
description: "Añade clientes manualmente o por CSV, gestiona niveles de descuento y completa la información fiscal."
---

<header class="content-header">
  <h1 class="page-title">Datos del cliente</h1>
  <p class="page-subtitle">El primer paso de tu cotización: define a quién le estás vendiendo y asegura que la factura saldrá sin errores.</p>
</header>

## Formas de agregar clientes

Al iniciar una nueva cotización, el primer panel que verás es el de **Información del Cliente**. Cord te ofrece diferentes maneras de nutrir tu base de datos:

1. **Creación Manual:** Directamente desde el cotizador, puedes hacer clic en "Nuevo Cliente" y llenar un formulario rápido con sus datos comerciales y fiscales.
2. **Importación Masiva (CSV / Excel):** Si estás migrando desde otro CRM o ERP, puedes ir a la sección de Clientes en el menú principal, descargar nuestra plantilla CSV y subir miles de contactos en segundos.
3. **Sincronización por API:** Para equipos de desarrollo, Cord ofrece una API REST para sincronizar prospectos automáticamente desde Salesforce, Hubspot o tu propio sistema interno.

## Niveles de Cliente y Descuentos Automáticos

En B2B, no todos los clientes pagan lo mismo. Cord soporta **Niveles de Cliente** (Tiers). 
Al crear o editar un cliente, puedes asignarle una categoría, por ejemplo:
- Nivel 1 (Público General): Sin descuento.
- Nivel 2 (Distribuidores): 15% de descuento.
- Nivel 3 (Mayoristas VIP): 30% de descuento.

**¿Cómo funciona?** Cuando selecciones a un cliente Nivel 2 en tu cotización, Cord aplicará automáticamente el 15% de descuento a todos los productos que agregues, ahorrándole a tu equipo de ventas el tener que calcular o recordar las reglas de precios.

## La Información Comercial y Fiscal

Para que un perfil de cliente esté completo, consta de dos partes vitales:

### Información Comercial (Lo que ve el cliente)
- **Nombre de la empresa:** El nombre comercial (Ej: *Flouvia*).
- **Contacto principal:** La persona que tomará la decisión (Ej: *André Valle*).
- **Correo electrónico:** A dónde se enviarán las notificaciones de la cotización y el enlace mágico.

### Información Fiscal (Para el CFDI 4.0)
Si dejas esto para después, tu cotización será válida comercialmente, pero **no podrás timbrarla**. Te sugerimos pedir estos datos desde el principio:

- **Razón Social:** Exactamente como aparece en la Constancia de Situación Fiscal (CSF), **sin** el régimen societario (Ej: Escribe *FLOUVIA* en lugar de *FLOUVIA SAPI DE CV*).
- **RFC:** Registro Federal de Contribuyentes. Cord cuenta con una **validación inteligente de RFCs**; si detectamos que la estructura es incorrecta, te avisaremos antes de guardar.
- **Código Postal Fiscal:** Debe coincidir con su CSF.
- **Régimen Fiscal:** El régimen bajo el que tributa (Ej: *Régimen General de Ley Personas Morales*).
- **Uso de CFDI:** El motivo por el cual el cliente solicita la factura (Ej: *G03 - Gastos en general*).
