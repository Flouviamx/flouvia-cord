---
title: "[EN] Cord 101: Primeros pasos"
description: "Acelera tu integración. Configura tu cuenta empresarial, emite facturas y recibe pagos en 5 sencillos pasos."
category: "Account"
order: 1
---

Bienvenido a Cord. Hemos diseñado esta guía para que puedas tener tu cuenta operando, facturando y cobrando en menos de 20 minutos. 

Si es tu primera vez utilizando la plataforma, te recomendamos seguir esta ruta lineal.

## Paso 1: Configuración de la Empresa
El núcleo de Cord es tu perfil fiscal y operativo. Antes de emitir un pago o una factura, necesitas validar tu identidad corporativa.

1. Navega a **Ajustes > Empresa**.
2. Ingresa tu Razón Social, RFC y Régimen Fiscal.
3. Sube tu **CSD (Certificado de Sello Digital)**. Este es el archivo `.cer` y `.key` que te proporciona el SAT, junto con tu contraseña. *Sin este paso, no podrás emitir facturas ni complementos de pago (REP).*

## Paso 2: Conectar tu API (Para Desarrolladores)
Si vas a utilizar Cord de forma programática (vía nuestra API o SDKs), el siguiente paso es obtener tus credenciales.

- Ve a **Desarrolladores > API Keys**.
- Verás dos entornos: `Modo Prueba (Sandbox)` y `Modo en Vivo (Producción)`.
- Copia tu `Secret Key` de prueba. Inyéctala en tu entorno de desarrollo local.
- Consulta nuestra documentación técnica para realizar tu primera llamada de prueba `/ping`.

## Paso 3: Configurar Métodos de Cobro
Cord te permite cobrar vía Tarjeta de Crédito, Transferencia (SPEI) y Divisas Internacionales.

1. Ve a **Cobranza > Métodos de Pago**.
2. Activa las pasarelas que desees utilizar. 
3. *Nota importante:* Los cobros internacionales (Wire) requieren validación adicional de KYC (Conoce a tu Cliente) que puede tomar hasta 48 horas en activarse.

## Paso 4: Crear tu primer Cliente
Para emitir una cotización o factura, necesitas una contraparte.

1. Ve a **Clientes > Nuevo Cliente**.
2. Ingresa su Razón Social y RFC.
3. Asigna términos de crédito (Ej. Net-30). Si el cliente tiene un límite de crédito aprobado, agrégalo en este paso para que Cord monitoree su exposición crediticia automáticamente.

## Paso 5: Emitir tu primer cobro
Estás listo. Ahora puedes crear una **Cotización interactiva** o simplemente enviar un **Link de Pago** público.

- **Para Links Rápidos:** Ve a *Cobranza > Links de Pago* y genera una liga universal.
- **Para Flujos B2B:** Crea una cotización, añade los ítems, y al enviarla, Cord generará automáticamente un flujo de pago. Cuando el cliente pague, Cord timbrará la factura PUE automáticamente.

## ¿Qué sigue?
- [Configurar Webhooks](/soporte/configurar-webhooks)
- [Invitar a tu equipo](/soporte/invitar-miembros-roles)
- [Entender el manejo de disputas](/soporte/manejo-disputas)
