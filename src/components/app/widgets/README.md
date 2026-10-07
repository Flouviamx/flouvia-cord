# Biblioteca de widgets de Cord

Punto de entrada para construir widgets de la app. En VS Code: ⌘P y escribir
`src/components/app/widgets/README.md`.

## Componentes implementados

| Componente | Responsabilidad | Consumidores |
| --- | --- | --- |
| `WidgetCard.astro` | Superficie, identidad, categoría, tamaños y disponibilidad opcional | Indicadores y las 42 tarjetas existentes de Informes |
| `MetricWidget.astro` | Indicador y desglose ampliado | Inicio, Desempeño, Informes, Cobros, Cobranza e IA |
| `ChartWidget.astro` | Encabezado, datos declarativos, gráfica y estado vacío | Informes; líneas, barras, rankings, embudo y segmentos |
| `ListWidget.astro` | Filas, enlaces, detalles y estado vacío | Volumen de productos |
| `WidgetHeader.astro` | Título y descripción uniformes | Gráficas y listas |
| `TrendKpi.astro` | KPI que sigue al rango: cifra, variación contra el periodo anterior y sparkline (o barra para tasas). El cálculo vive en `src/lib/dash-kpis.ts` y lo comparten SSR y cliente | Inicio (tasa, ticket, cobrado) |
| `ScopeTag.astro` | Pastilla Hoy / Rango / Histórico: qué ventana mide el widget | Inicio e Informes |

```astro
---
import MetricWidget from './MetricWidget.astro';
---
<MetricWidget
    id="indicador-estable"
    title="Ventas cerradas"
    value={importeFormateado}
    description="Histórico acumulado"
    details={[{ label: 'Cobrado', value: cobradoFormateado }]}
/>
```

Las páginas resuelven permisos, consultan datos y traducen/formatean los valores.
Los componentes no consultan la base. `MetricWidget` habilita Ampliado únicamente
cuando recibe detalles. El slot `value` permite contenido como una persona sin
reescribir la etiqueta, descripción o superficie.

## Infraestructura compartida

- `../WidgetGrid.astro`: posiciones, edición, visibilidad y persistencia.
- `src/lib/widget-library.ts`: la biblioteca flotante (tarjeta anclada al botón en
  escritorio, hoja inferior en móvil). Se monta en `<body>` para escapar del
  `transform` y los `overflow:hidden` de los ancestros del grid.
- `src/lib/widget-preview.ts`: miniaturas de la biblioteca, dibujadas con los MISMOS
  datos que la tarjeta trae en su markup (`data-items`, `data-points`, `data-steps`,
  `data-segments`, `data-slices`, `data-values`, `.kpi-num`, filas de lista). Un
  widget nuevo se ve bien en la biblioteca si declara sus datos así; no hace falta
  una plantilla aparte.
- `../WidgetEditButtons.astro`: controles de cada widget.
- `../WidgetCustomizeButtons.astro`: entrada/salida del editor.
- `../WidgetEmpty.astro`: estados vacíos existentes.
- `src/styles/widgets.css`: cuadrícula y controles.
- `src/layouts/AppLayout.astro`: tokens de superficie y tipografía compartida.
- `src/lib/chart.ts` y `src/styles/charts.css`: gráficas.
- `src/lib/widget-catalog.ts`: claves de persistencia autorizadas.

## Contrato visual y migración

Usar `kpi-label`, `kpi-num`, `kpi-sub` y `sec-title`, tomando Inicio como referencia.
Los encabezados no llevan puntos decorativos. La vista ampliada debe aportar
contenido real. Conservar los IDs y claves de persistencia al migrar para respetar
la organización del usuario. El CSS que depende del artículo de `WidgetCard`
debe ser global: Astro no transmite el scope de la página al markup interno.

## Widgets opcionales

`optional` declara un widget disponible pero no agregado. No usar `hidden` para
este propósito: `hidden` se reserva para gates/estado no disponible. Los widgets
ocultos por permisos nunca deben recibir `optional`. Renderizar los opcionales
dentro del mismo gate de permisos y plan que sus datos.

El editor distingue los opcionales nuevos mediante los IDs conocidos en `order`;
el array `hidden` conserva las decisiones. Así un widget nuevo no aparece por
sorpresa en layouts guardados y Restablecer lo devuelve a la biblioteca. No hay
cambio en el formato del endpoint de preferencias. Contrato: `widget-defaults.ts`
y `test/widget-defaults.test.ts`; la fase prepaint refleja la misma regla.

Catálogo opcional (17 widgets):
- Inicio: conversión enviada a pagada, pipeline ponderado, cobrado del rango, días a cierre,
  facturas vencidas y ranking de vendedores.
- Equipo: ticket por cotización ganada de miembros activos.
- Resumen: cotizaciones decididas de la cohorte.
- Comercial: seguimientos detenidos.
- Clientes: relaciones por reactivar.
- Productos: unidades por producto.
- Finanzas: igualas activas.
- Flujo: ingreso esperado diario.
- Informe de cobranza: documentos por cobrar.
- Cobros: contratos recurrentes.
- Cobranza operativa: clientes con límite de crédito excedido.
- Cobranza IA: fallos de envío en 30 días.

Todos usan datos ya cargados por su página; conservan sus rangos y permisos.
La biblioteca permite buscar, filtrar por Todos / Para agregar / categoría
(`group`) y recuperar widgets. Un widget oculto desde el servidor (permiso, plan o
conexión) queda bloqueado y la biblioteca no lo ofrece. Las miniaturas no clonan
DOM: no arrastran ids ni bindings.

La migración es incremental: Informes comparte la superficie de todas sus tarjetas;
varias gráficas y la lista de volumen ya son componentes completos. Los widgets
operativos con acciones y renderizado dinámico aún conservan su markup específico
para no romper sus controles. Comparten el editor, biblioteca y estilos globales.
