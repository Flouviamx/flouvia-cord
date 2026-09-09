import { getEffectivePlan } from '../org-entitlements';
import { sql, withOrgTx } from '../db';
import { planIncludes, type PlanId } from '../entitlements';

export type InvoiceMode = 'commercial' | 'fiscal';

export function isFiscalDocument(type: string, country: string, provider?: string): boolean {
  if (country === 'MX' && !['proforma', 'commercial_invoice', 'commercial_credit_note'].includes(type)) return true;
  return ['cfdi_40', 'cfdi_egreso', 'verifactu_invoice', 'verifactu_credit_note'].includes(type)
    || country === 'ES' && provider === 'verifactu';
}

export function selectDocumentType(country: string, plan: PlanId, mode: unknown, verifactuReady = false): string {
  if (mode !== undefined && mode !== 'commercial' && mode !== 'fiscal') throw new Error('Tipo de documento inválido.');
  const fiscal = mode === 'fiscal' || mode === undefined && planIncludes(plan, 'cfdi')
    && (country === 'MX' || country === 'ES' && verifactuReady);
  if (!fiscal) return ['MX', 'ES'].includes(country) ? 'proforma' : 'commercial_invoice';
  if (!planIncludes(plan, 'cfdi')) throw new Error('La emisión fiscal integrada requiere Starter o un plan superior.');
  if (country === 'MX') return 'cfdi_40';
  if (country === 'ES' && verifactuReady) return 'verifactu_invoice';
  throw new Error('La emisión fiscal integrada todavía no está habilitada para tu cuenta y país.');
}

export async function documentTypeForOrg(orgId: string, country: string, mode?: unknown): Promise<string> {
  const plan = await getEffectivePlan(orgId);
  let ready = false;
  if (country === 'ES' && planIncludes(plan, 'cfdi')) {
    const [[org]] = await withOrgTx(orgId, sql`select verifactu_modo from orgs where id = ${orgId} limit 1`);
    ready = org?.verifactu_modo === 'verifactu' && process.env.VERIFACTU_AEAT_ENABLED === 'true';
  }
  return selectDocumentType(country, plan, mode, ready);
}

// Series distintas evitan colisiones con el índice único org/país/folio y
// mantienen visualmente separados los documentos comerciales de los fiscales.
export function documentPrefix(type: string, fiscalPrefix: string): string {
  if (type === 'proforma') return 'PRO';
  if (type === 'commercial_credit_note') return 'NCC';
  if (type === 'cfdi_egreso' || type === 'verifactu_credit_note') return `NC-${fiscalPrefix}`;
  return fiscalPrefix;
}
