import { getEffectivePlan } from '../org-entitlements';
import { sql, withOrgTx } from '../db';
import { planIncludes, type PlanId } from '../entitlements';
import { verifactuEnvioConfig } from './verifactu/sif';
import { DOCUMENTOS_DE_RIELES, esNotaCreditoDeRail, esNotaDebitoDeRail, railDePais, rielesDePais } from './latam/rieles';
import { railListo } from './latam/estado';

export type InvoiceMode = 'commercial' | 'fiscal';

export function documentTypeFor(country: string): string {
  return country.toUpperCase() === 'MX' ? 'cfdi_40' : 'commercial_invoice';
}

export function isFiscalDocument(type: string, country: string, provider?: string): boolean {
  if (country === 'MX' && !['proforma', 'commercial_invoice', 'commercial_credit_note'].includes(type)) return true;
  return ['cfdi_40', 'cfdi_egreso', 'verifactu_invoice', 'verifactu_credit_note', ...DOCUMENTOS_DE_RIELES].includes(type)
    || country === 'ES' && provider === 'verifactu';
}

/**
 * `railReady`: el registro regulatorio del país está listo para la cuenta —
 * Verifactu en España, o el riel de LatAm del país (src/lib/fiscal/latam/).
 */
export function selectDocumentType(country: string, plan: PlanId, mode: unknown, railReady = false): string {
  if (mode !== undefined && mode !== 'commercial' && mode !== 'fiscal') throw new Error('Tipo de documento inválido.');
  const rail = railDePais(country);
  const fiscal = mode === 'fiscal' || mode === undefined && planIncludes(plan, 'cfdi')
    && (country === 'MX' || (country === 'ES' || !!rail) && railReady);
  // Con el riel listo, lo no fiscal es una proforma (como en MX y ES): una
  // "factura" sin autorización de la autoridad no es válida allí. Sin el riel,
  // el país conserva la factura comercial de siempre.
  if (!fiscal) return ['MX', 'ES'].includes(country) || rail && railReady ? 'proforma' : 'commercial_invoice';
  if (!planIncludes(plan, 'cfdi')) throw new Error('La emisión fiscal integrada requiere Starter o un plan superior.');
  if (country === 'MX') return 'cfdi_40';
  if (country === 'ES' && railReady) return 'verifactu_invoice';
  if (rail && railReady) return rail.documentos.factura;
  throw new Error('La emisión fiscal integrada todavía no está habilitada para tu cuenta y país.');
}

export async function documentTypeForOrg(orgId: string, country: string, mode?: unknown): Promise<string> {
  const plan = await getEffectivePlan(orgId);
  let ready = false;
  if (country === 'ES' && planIncludes(plan, 'cfdi')) {
    const [[org]] = await withOrgTx(orgId, sql`select verifactu_modo from orgs where id = ${orgId} limit 1`);
    // El mismo interruptor que decide si el provider encadena (sif.ts).
    ready = org?.verifactu_modo === 'verifactu' && verifactuEnvioConfig().habilitado;
  }
  const rail = railDePais(country);
  // El mismo estado que decide si el proveedor del riel autoriza. Brasil tiene
  // dos rieles (NFS-e y NF-e): basta con que uno esté listo; qué documento
  // nace lo decide después latam/nfe/enrutamiento.ts según sus conceptos.
  if (rail && planIncludes(plan, 'cfdi')) {
    for (const r of rielesDePais(country)) {
      if (await railListo(orgId, r.id)) { ready = true; break; }
    }
  }
  return selectDocumentType(country, plan, mode, ready);
}

// Series distintas evitan colisiones con el índice único org/país/folio y
// mantienen visualmente separados los documentos comerciales de los fiscales.
export function documentPrefix(type: string, fiscalPrefix: string, defaultPrefix?: string): string {
  if (type === 'proforma') return 'PRO';
  // Con una serie propia, sus notas de crédito también son suyas: dos
  // organizaciones con el mismo identificador fiscal (que ya no pueden
  // compartir serie, ver fiscal/serie.ts) emitían ambas "NCC-000001". Con la
  // serie por defecto del país se conserva "NCC", que es la que ya existe.
  if (type === 'commercial_credit_note') return defaultPrefix && fiscalPrefix !== defaultPrefix ? `NCC-${fiscalPrefix}` : 'NCC';
  if (type === 'cfdi_egreso' || type === 'verifactu_credit_note' || esNotaCreditoDeRail(type)) return `NC-${fiscalPrefix}`;
  // Nota de débito de un riel (Chile, DTE 56): su propia serie, como la nota de crédito.
  if (esNotaDebitoDeRail(type)) return `ND-${fiscalPrefix}`;
  return fiscalPrefix;
}
