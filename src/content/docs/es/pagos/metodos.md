---
title: "Métodos de cobro"
description: "Descubre cómo funciona la arquitectura de cobros de Cord: desde el SPEI Dinámico hasta los pagos con Tarjeta."
---

<header class="content-header">
  <h1 class="page-title">Métodos de cobro</h1>
  <p class="page-subtitle">Descubre cómo funciona la arquitectura de cobros de Cord: desde el SPEI Dinámico hasta los pagos con Tarjeta.</p>
</header>

## Arquitectura de cobros

Cord está diseñado para que el cobro no sea una fricción al final del proyecto, sino un proceso fluido e integrado. Al conectar tu cuenta de Stripe, desbloqueas dos métodos automáticos poderosos, además de conservar tu método de transferencia manual.

### 1. SPEI Dinámico (Stripe)

Este es el método ideal para B2B en México, diseñado específicamente para eliminar la conciliación manual de facturas.

**¿Cómo funciona?**
En lugar de darle a todos tus clientes la misma cuenta CLABE de tu empresa, Cord y Stripe generan **una CLABE virtual única, temporal y exclusiva por cada cobro**. 

Cuando el cliente hace clic en "Pagar con SPEI":
1. El sistema crea una subcuenta virtual instantánea asignada únicamente a esa cotización específica.
2. El cliente ve las instrucciones para transferir desde su app bancaria a esa nueva CLABE (ej. "Sistema de Transferencias y Pagos STP").
3. Cuando los fondos llegan a la red interbancaria, Stripe los detecta e inmediatamente identifica a qué cotización pertenecen (porque la CLABE era única para esa venta).
4. Cord recibe la notificación en tiempo real, marca la cotización como **Pagada**, y te envía un correo de confirmación.

> **Cero colisiones:** A diferencia del modelo tradicional donde recibes un depósito de "$15,000" y tienes que investigar qué cliente lo envió, el SPEI dinámico hace imposible que dos pagos se confundan.

### 2. Tarjeta de crédito y débito

El método más rápido y de menor fricción. Se presenta directamente en el *checkout in-house* de Cord (PaymentIsland) sin sacar al cliente de la cotización en ningún momento.

**Características clave:**
- Soporta **Visa, Mastercard y American Express**.
- Interfaz nativa estilo *Premium* tematizada dinámicamente (`--theme-color`) a los colores de tu marca, garantizando una experiencia de marca propia sin logos de terceros.
- **Autorización atómica:** En el momento en que el cliente presiona "Pagar", los fondos son autorizados y la cotización pasa a estado Pagado en menos de un segundo.

### 3. Transferencia bancaria manual

Si decides no usar Stripe o si la cotización es de un monto gigantesco donde prefieres ahorrarte cualquier comisión, puedes dejar activa la transferencia manual.

**El flujo manual:**
1. El cliente ve tus datos bancarios tradicionales (Banco, CLABE, Beneficiario) configurados en Ajustes.
2. El cliente hace la transferencia por fuera.
3. Tú (como vendedor) debes entrar a la cotización en Cord y presionar el botón de "Marcar como pagado" manualmente una vez que hayas verificado que el dinero aterrizó en tu banca empresarial.
