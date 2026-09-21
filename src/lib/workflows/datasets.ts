// Consultas que un workflow puede hacer ANTES de decidir. Sin esto, un workflow
// solo sabe lo que traía el evento: "¿cuánto me deben?" no era una pregunta que
// se pudiera hacer, así que un aviso semanal de cartera era imposible.
//
// Es un catálogo CERRADO, no SQL del usuario: cada consulta declara qué
// devuelve y el editor sabe qué variables quedan disponibles después del paso.
//
// Este archivo son SOLO metadatos y no importa la base de datos: el editor lo
// carga en el navegador. El SQL vive en `datasets-run.ts`, que corre en
// servidor y en el carril de la organización (regla 30). Un paso de consulta
// nunca escribe.

import type { Text, WorkflowField } from './catalog';

export interface DatasetParam {
    key: string;
    label: Text;
    hint?: Text;
    /** Días hacia atrás o hacia adelante, según la consulta. */
    kind: 'days';
    min: number;
    max: number;
    default: number;
}

export interface WorkflowDataset {
    key: string;
    label: Text;
    description: Text;
    /** 'org' = no necesita documento; 'client' = usa el cliente del evento. */
    scope: 'org' | 'client';
    params: DatasetParam[];
    outputs: WorkflowField[];
}

const text = (es: string, en: string): Text => ({ es, en });
const out = (key: string, es: string, en: string, type: WorkflowField['type']): WorkflowField =>
    ({ key, label: text(es, en), type });
const dias = (es: string, en: string, def: number, min: number, max: number): DatasetParam =>
    ({ key: 'dias', label: text(es, en), kind: 'days', min, max, default: def });

export const WORKFLOW_DATASETS: WorkflowDataset[] = [
    {
        key: 'cartera_vencida',
        label: text('Consultar la cartera vencida', 'Look up overdue receivables'),
        description: text(
            'Trae cuánto te deben con el plazo ya pasado y en cuántos documentos.',
            'Brings how much you are owed past the due date, and across how many documents.',
        ),
        scope: 'org',
        params: [],
        outputs: [
            out('vencido_total', 'Total vencido', 'Overdue total', 'number'),
            out('vencido_cantidad', 'Documentos vencidos', 'Overdue documents', 'number'),
            out('vencido_dias_max', 'Días del más atrasado', 'Days of the oldest one', 'number'),
        ],
    },
    {
        key: 'pipeline_abierto',
        label: text('Consultar el pipeline abierto', 'Look up the open pipeline'),
        description: text(
            'Trae cuánto hay en cotizaciones enviadas o vistas que todavía no se deciden.',
            'Brings how much sits in sent or viewed quotes that are still undecided.',
        ),
        scope: 'org',
        params: [],
        outputs: [
            out('pipeline_total', 'Total en pipeline', 'Pipeline total', 'number'),
            out('pipeline_cantidad', 'Cotizaciones abiertas', 'Open quotes', 'number'),
        ],
    },
    {
        key: 'cobrado_periodo',
        label: text('Consultar lo cobrado', 'Look up what was collected'),
        description: text(
            'Trae cuánto se pagó en los últimos días que elijas.',
            'Brings how much was paid over the last days you choose.',
        ),
        scope: 'org',
        params: [dias('Días hacia atrás', 'Days back', 7, 1, 90)],
        outputs: [
            out('cobrado_total', 'Total cobrado', 'Collected total', 'number'),
            out('cobrado_cantidad', 'Cotizaciones pagadas', 'Quotes paid', 'number'),
        ],
    },
    {
        key: 'por_vencer',
        label: text('Consultar lo que está por vencer', 'Look up what is about to be due'),
        description: text(
            'Trae cuánto vence en los próximos días, entre facturas y cotizaciones con plazo.',
            'Brings how much is due over the next days, across invoices and quotes with terms.',
        ),
        scope: 'org',
        params: [dias('Días hacia adelante', 'Days ahead', 7, 1, 90)],
        outputs: [
            out('por_vencer_total', 'Total por vencer', 'Total about to be due', 'number'),
            out('por_vencer_cantidad', 'Documentos por vencer', 'Documents about to be due', 'number'),
        ],
    },
    {
        key: 'saldo_cliente',
        label: text('Consultar el saldo del cliente', "Look up the client's balance"),
        description: text(
            'Trae cuánto debe en total el cliente del evento y cuánto de eso ya venció.',
            "Brings how much the event's client owes in total and how much of it is overdue.",
        ),
        scope: 'client',
        params: [],
        outputs: [
            out('cliente_saldo', 'Saldo del cliente', 'Client balance', 'number'),
            out('cliente_vencido', 'Vencido del cliente', 'Client overdue', 'number'),
            out('cliente_documentos', 'Documentos abiertos', 'Open documents', 'number'),
        ],
    },
];

export const findDataset = (key: string | null | undefined) => WORKFLOW_DATASETS.find((d) => d.key === key);

/** Campos que un paso de consulta deja disponibles para los pasos siguientes. */
export const datasetOutputs = (key: string | null | undefined): WorkflowField[] => findDataset(key)?.outputs ?? [];
