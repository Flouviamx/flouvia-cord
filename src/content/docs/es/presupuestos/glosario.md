---
title: "Glosario contable"
description: "Domina el lenguaje financiero de los negocios B2B: desde Flujo de Efectivo hasta CIF."
---

<header class="content-header">
  <h1 class="page-title">Glosario contable</h1>
  <p class="page-subtitle">Domina el lenguaje financiero de los negocios B2B: desde Flujo de Efectivo hasta CIF.</p>
</header>

## El lenguaje de la planeación corporativa

Para sacarle el máximo provecho al motor de presupuestos maestros de Cord, es fundamental que tú y tu equipo hablen el mismo idioma financiero. A continuación, te explicamos los términos contables clave en una tabla de referencia técnica:

<div style="border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; background: #ffffff; margin-top: 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.02);">
  
  <div style="display: flex; flex-wrap: wrap; border-bottom: 1px solid #e2e8f0;">
    <div style="flex: 1; min-width: 220px; background: #f8fafc; padding: 24px; border-right: 1px solid #e2e8f0;">
      <h4 style="margin: 0; font-size: 15px; font-weight: 600; color: #0f172a;">Flujo Neto de Efectivo</h4>
    </div>
    <div style="flex: 2; min-width: 280px; padding: 24px;">
      <p style="margin: 0 0 12px 0; font-size: 15px; color: #334155; line-height: 1.5;"><strong>Net Cash Flow.</strong> Es la diferencia real entre el dinero que entra a tu cuenta bancaria y el dinero que sale en un mes específico.</p>
      <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;"><em>Importancia:</em> Una empresa puede ser rentable en papel pero quebrar si su flujo neto es negativo (porque vendió todo a crédito a 90 días y hoy no tiene para pagar nómina).</p>
    </div>
  </div>

  <div style="display: flex; flex-wrap: wrap; border-bottom: 1px solid #e2e8f0;">
    <div style="flex: 1; min-width: 220px; background: #ffffff; padding: 24px; border-right: 1px solid #e2e8f0;">
      <h4 style="margin: 0; font-size: 15px; font-weight: 600; color: #0f172a;">Mano de Obra Directa (MOD)</h4>
    </div>
    <div style="flex: 2; min-width: 280px; padding: 24px;">
      <p style="margin: 0 0 12px 0; font-size: 15px; color: #334155; line-height: 1.5;">El costo del personal que está <strong>directamente involucrado</strong> en producir el bien o entregar el servicio. Se costea usualmente en "Horas/Hombre".</p>
      <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;"><em>Ejemplo:</em> El salario del desarrollador que escribe el código de la app, o el obrero que ensambla la pieza. El salario del CEO <em>no</em> es MOD.</p>
    </div>
  </div>

  <div style="display: flex; flex-wrap: wrap; border-bottom: 1px solid #e2e8f0;">
    <div style="flex: 1; min-width: 220px; background: #f8fafc; padding: 24px; border-right: 1px solid #e2e8f0;">
      <h4 style="margin: 0; font-size: 15px; font-weight: 600; color: #0f172a;">Costos Indirectos (CIF / Overhead)</h4>
    </div>
    <div style="flex: 2; min-width: 280px; padding: 24px;">
      <p style="margin: 0 0 12px 0; font-size: 15px; color: #334155; line-height: 1.5;"><strong>Costos Indirectos de Fabricación u Operativos.</strong> Son los gastos necesarios para mantener vivo el negocio, pero que no se pueden rastrear a un solo proyecto.</p>
      <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;"><em>Ejemplo:</em> La renta de la oficina, sueldos administrativos, luz y suscripciones mensuales. Deben "prorratearse" en los presupuestos.</p>
    </div>
  </div>

  <div style="display: flex; flex-wrap: wrap; border-bottom: 1px solid #e2e8f0;">
    <div style="flex: 1; min-width: 220px; background: #ffffff; padding: 24px; border-right: 1px solid #e2e8f0;">
      <h4 style="margin: 0; font-size: 15px; font-weight: 600; color: #0f172a;">Presupuesto vs. Real (BvA)</h4>
    </div>
    <div style="flex: 2; min-width: 280px; padding: 24px;">
      <p style="margin: 0 0 12px 0; font-size: 15px; color: #334155; line-height: 1.5;"><strong>Budget vs. Actual.</strong> El módulo de control financiero definitivo. Compara el plan que trazaste ("pensé que vendería $50,000 en Enero") contra lo que realmente sucedió conectándose a la cuenta bancaria o a las transacciones de Stripe.</p>
      <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5; font-family: monospace; background: #f1f5f9; padding: 4px 8px; border-radius: 6px; display: inline-block;">Fórmula Desviación: (Real - Presupuesto) / Presupuesto</p>
    </div>
  </div>

  <div style="display: flex; flex-wrap: wrap; border-bottom: 1px solid #e2e8f0;">
    <div style="flex: 1; min-width: 220px; background: #f8fafc; padding: 24px; border-right: 1px solid #e2e8f0;">
      <h4 style="margin: 0; font-size: 15px; font-weight: 600; color: #0f172a;">Inventario Inicial / Final</h4>
    </div>
    <div style="flex: 2; min-width: 280px; padding: 24px;">
      <p style="margin: 0 0 12px 0; font-size: 15px; color: #334155; line-height: 1.5;">Las cédulas de producción en Cord son <strong>herramientas de planeación, no sistemas de inventario en vivo (ERP)</strong>.</p>
      <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;">Por lo tanto, el Inventario Inicial no se lee de una bodega, sino que es un <em>supuesto</em> que tecleas como punto de partida para que el motor calcule cuántas unidades extras debes fabricar para alcanzar tu meta.</p>
    </div>
  </div>

  <div style="display: flex; flex-wrap: wrap; border-bottom: 1px solid #e2e8f0;">
    <div style="flex: 1; min-width: 220px; background: #ffffff; padding: 24px; border-right: 1px solid #e2e8f0;">
      <h4 style="margin: 0; font-size: 15px; font-weight: 600; color: #0f172a;">VPN y TIR</h4>
    </div>
    <div style="flex: 2; min-width: 280px; padding: 24px;">
      <p style="margin: 0 0 12px 0; font-size: 15px; color: #334155; line-height: 1.5;"><strong>Valor Presente Neto (NPV) y Tasa Interna de Retorno (IRR).</strong> Métricas para evaluar si vale la pena hacer una inversión. El VPN descuenta el valor del dinero en el tiempo; si es mayor a cero, el proyecto es rentable.</p>
      <p style="margin: 0; font-size: 14px; color: #64748b; line-height: 1.5;"><em>Tasa de Descuento:</em> El % de rendimiento mínimo que le exiges al proyecto (usualmente el costo de tu deuda o el rendimiento de una inversión segura).</p>
    </div>
  </div>

  <div style="display: flex; flex-wrap: wrap; border-bottom: 1px solid #e2e8f0;">
    <div style="flex: 1; min-width: 220px; background: #f8fafc; padding: 24px; border-right: 1px solid #e2e8f0;">
      <h4 style="margin: 0; font-size: 15px; font-weight: 600; color: #0f172a;">Periodo de Recuperación</h4>
    </div>
    <div style="flex: 2; min-width: 280px; padding: 24px;">
      <p style="margin: 0 0 12px 0; font-size: 15px; color: #334155; line-height: 1.5;"><strong>Payback Period.</strong> El tiempo exacto (en años y meses) que tardará el proyecto en generar suficiente flujo de efectivo para devolverte la inversión inicial de tu bolsillo.</p>
    </div>
  </div>

  <div style="display: flex; flex-wrap: wrap; border-bottom: 1px solid #e2e8f0;">
    <div style="flex: 1; min-width: 220px; background: #ffffff; padding: 24px; border-right: 1px solid #e2e8f0;">
      <h4 style="margin: 0; font-size: 15px; font-weight: 600; color: #0f172a;">Cantidad Económica de Pedido (EOQ)</h4>
    </div>
    <div style="flex: 2; min-width: 280px; padding: 24px;">
      <p style="margin: 0 0 12px 0; font-size: 15px; color: #334155; line-height: 1.5;"><strong>Economic Order Quantity (CEP en español).</strong> El tamaño de pedido matemático perfecto que minimiza los costos totales de inventario (equilibrando lo que cuesta ordenar fletes vs. lo que cuesta almacenar cajas).</p>
    </div>
  </div>

  <div style="display: flex; flex-wrap: wrap;">
    <div style="flex: 1; min-width: 220px; background: #f8fafc; padding: 24px; border-right: 1px solid #e2e8f0;">
      <h4 style="margin: 0; font-size: 15px; font-weight: 600; color: #0f172a;">Presupuesto Flexible (Variaciones)</h4>
    </div>
    <div style="flex: 2; min-width: 280px; padding: 24px;">
      <p style="margin: 0 0 12px 0; font-size: 15px; color: #334155; line-height: 1.5;">Una herramienta que analiza por qué gastaste más de lo planeado, dividiendo el problema en dos variaciones:</p>
      <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #64748b; line-height: 1.6;">
        <li><strong>Variación de Precio:</strong> Compraste los insumos más caros de lo planeado.</li>
        <li><strong>Variación de Eficiencia:</strong> Desperdiciaste más insumos de lo planeado para producir la misma cantidad de unidades.</li>
      </ul>
    </div>
  </div>

</div>
