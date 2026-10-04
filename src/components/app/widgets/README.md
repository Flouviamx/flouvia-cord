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
| `ChartPreview.astro` | Miniatura estática derivada de datos reales | Biblioteca de gráficas, aun estando ocultas |

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

- `../WidgetGrid.astro`: posiciones, edición, biblioteca, visibilidad y persistencia.
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

Catálogo opcional (13 widgets):
- Inicio: conversión enviada a pagada, pipeline ponderado.
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
La biblioteca permite buscar, filtrar Todos/Para agregar y recuperar widgets.
Las previews son inertes, sin IDs ni bindings duplicados.

La migración es incremental: Informes comparte la superficie de todas sus tarjetas;
varias gráficas y la lista de volumen ya son componentes completos. Los widgets
operativos con acciones y renderizado dinámico aún conservan su markup específico
para no romper sus controles. Comparten el editor, biblioteca y estilos globales.
