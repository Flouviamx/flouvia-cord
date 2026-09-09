// Mechanical section extraction, not a legal drafting or approval tool.
// Keeps original clauses intact for redlining. Never overwrites existing drafts.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIGNUP_LEGAL_BUNDLES } from '../src/lib/legal-corpus.ts';
import { LEGAL_CORPUS_PLAN } from '../src/lib/legal-corpus-plan.ts';

const root = join(import.meta.dirname, '..');
const drafts = [
  ['payments-terms', ['Condiciones de pagos', 'Payment terms'], [['terms', 'pagos-autorizacion'], ['terms', 'reembolsos']],
    ['Confirmar tarifas, facultades de débito, saldos negativos y aceptación específica por organización; no sustituir FEE_TERMS_VERSION.', 'Verify fees, debit authority, negative balances and organization-specific acceptance; do not replace FEE_TERMS_VERSION.']],
  ['invoicing-terms', ['Condiciones de facturación', 'Invoicing terms'], [['terms', 'descripcion'], ['terms', 'fiscal']],
    ['Revisar el lenguaje heredado de Verifactu contra el gate de envío desactivado y la declaración responsable pendiente; separar CFDI, documento comercial y remisión real.', 'Review legacy Verifactu wording against the disabled submission gate and pending producer declaration; distinguish CFDI, commercial documents and actual remittance.']],
  ['kyc-aml-policy', ['Verificación de identidad', 'Identity verification'], [['privacy', 'datos']],
    ['Validar roles y fundamento por registro, incluido el plazo heredado de cinco años; no atribuir a Cord todas las obligaciones del procesador.', 'Validate roles and each record retention basis, including the inherited five-year period; do not assign all processor obligations to Cord.']],
  ['collections-notice', ['Aviso de cobranza', 'Collections notice'], [['terms', 'pagos-autorizacion'], ['privacy', 'uso']],
    ['El interés moratorio automático permanece deshabilitado en todos los países. Revisar el extracto contra late-interest-policy.ts y la identificación del acreedor antes de redactar el aviso final.', 'Automatic late interest remains disabled in every country. Review the extract against late-interest-policy.ts and creditor identification before drafting the final notice.']],
  ['ai-disclosure', ['Divulgación sobre IA', 'AI disclosure'], [['privacy', 'uso'], ['privacy', 'dpa']],
    ['Precisar intervención humana, instrucciones, destinatarios y límites por función; las fuentes extraídas no constituyen un aviso de IA completo.', 'Specify human involvement, instructions, recipients and limits for each feature; these extracts do not constitute a complete AI notice.']],
  ['dispute-evidence-notice', ['Evidencia de disputas', 'Dispute evidence notice'], [['terms', 'reembolsos'], ['privacy', 'datos']],
    ['Delimitar selección de campos, vista previa, confirmación y destinatarios; no interpretar el extracto como autorización para transmitir todo el hilo comercial.', 'Define field selection, preview, confirmation and recipients; do not interpret this extract as authorization to transmit the entire commercial conversation.']],
  ['acceptable-use-policy', ['Uso aceptable', 'Acceptable use policy'], [['terms', 'prohibidas'], ['terms', 'fairuse']],
    ['Contrastar límites reales y facultades de suspensión con entitlements.ts; no conservar una promesa absoluta de servicio ilimitado o sin bloqueos.', 'Check actual limits and suspension rights against entitlements.ts; do not retain an absolute promise of unlimited or unblockable service.']],
  ['subprocessors', ['Terceros y subencargados', 'Third parties and sub-processors'], [['privacy', 'dpa'], ['privacy', 'internacionales']],
    ['Contrastar cada fila con legal-providers.ts y obtener región, contratos de cuenta y mecanismo de transferencia; no todos los destinatarios son subencargados.', 'Check every row against legal-providers.ts and obtain account region, contracts and transfer mechanism; not all recipients are sub-processors.']],
  ['cookies-policy', ['Política de cookies', 'Cookie policy'], [['privacy', 'cookies']],
    ['Completar inventario de cookies, finalidades, proveedores y duración contra CookieConsent y analytics; preservar rechazo y revocación independientes del contrato.', 'Complete the cookie inventory, purposes, providers and duration against CookieConsent and analytics; preserve rejection and withdrawal independently of the contract.']],
  ['retention-policy', ['Conservación y eliminación', 'Retention and deletion'], [['privacy', 'seguridad'], ['privacy', 'portabilidad']],
    ['Definir calendario por tabla, evidencia contractual, proveedor y respaldo, con excepciones y prueba de eliminación. No inventar plazos no implementados.', 'Define schedules per table, contractual evidence, provider and backup, with exceptions and deletion evidence. Do not invent unimplemented deadlines.']],
  ['sla', ['Disponibilidad y niveles de servicio', 'Availability and service levels'], [['terms', 'sla']],
    ['El monitoreo actual es sintético diario y no acredita uptime continuo ni créditos SLA. No convertir un porcentaje de muestras en garantía contractual.', 'Current monitoring consists of daily synthetic checks and does not establish continuous uptime or SLA credits. Do not turn a sample percentage into a contractual guarantee.']],
];

const outputs = [];
for (const [locale, bundle] of Object.entries(SIGNUP_LEGAL_BUNDLES)) {
  const en = locale === 'en-US';
  for (const [docId, titles, sources, review] of drafts) {
    const target = join(root, 'src/content/legal', locale, `${docId}.md`);
    assert.ok(!existsSync(target), `${target}: already exists; do not overwrite editorial work`);
    const refs = sources.map(([sourceId, anchor]) => `${sourceId}@${bundle[sourceId].version}#${anchor}`);
    const sections = sources.map(([sourceId, anchor]) => {
      const source = readFileSync(join(root, 'src/content/legal', locale, `${sourceId}.md`), 'utf8');
      const start = source.indexOf(`<h2 id="${anchor}"`);
      assert.ok(start >= 0, `${sourceId}: missing ${anchor}`);
      const next = source.indexOf('<h2 id=', start + 1);
      const end = next < 0 ? source.lastIndexOf('\n</div>\n</div>\n</main>') : next;
      assert.ok(end > start);
      return source.slice(start, end).trim();
    });
    const dependencies = LEGAL_CORPUS_PLAN.find((entry) => entry.docId === docId).dependsOn;
    const content = `---
docId: ${docId}
version: "2026-08-30"
effectiveDate: "2026-08-30"
supersedes: null
locale: ${locale}
jurisdiction: GLOBAL
appliesToCountries: [MX, US, CA, BR, ES, GB, DE, FR, CO, AR, CL, PE]
requiresAction: false
action: none
acceptanceScope: none
publicationStatus: draft
sourceKind: markdown
sourceOfTruth: src/content/legal/${locale}/${docId}.md
artifactRoute: ${en ? '/en' : ''}/legal/${docId}
artifactSha256: "${'0'.repeat(64)}"
lastReviewed: "2026-08-30"
reviewedBy: Extracción técnica; revisión jurídica externa pendiente
dependsOn: ${JSON.stringify(dependencies)}
sourceSections: ${JSON.stringify(refs)}
releaseBlockers: [standalone-redline, verified-identity, legal-review, versioned-publication]
---

# ${titles[en ? 1 : 0]}

${en ? '**Controlled draft. Not published or effective.** The date above identifies this working copy, not an effective contract. These are verbatim extracts from the identified published versions; they may contain unresolved issues and must not be treated as approved standalone terms.' : '**Borrador controlado. No publicado ni en vigor.** La fecha anterior identifica esta copia de trabajo, no un contrato vigente. Estos son extractos literales de las versiones publicadas identificadas; pueden contener asuntos sin resolver y no deben tratarse como condiciones independientes aprobadas.'}

## ${en ? 'Review required before publication' : 'Revisión necesaria antes de publicar'}

${review[en ? 1 : 0]}

${en ? 'Complete scope, precedence, legal bases, verified parties and any required acceptance before assigning a nonzero artifact hash or adding a public route. Do not publish just by changing frontmatter.' : 'Completar alcance, prelación, fundamentos, partes verificadas y aceptación aplicable antes de asignar una huella de artefacto o añadir una ruta pública. No publicar cambiando solamente el frontmatter.'}

## ${en ? 'Extracted source material (not yet redlined)' : 'Material fuente extraído (sin corrección editorial todavía)'}

${refs.map((ref) => `- \`${ref}\``).join('\n')}

${sections.join('\n\n')}
`;
    outputs.push([target, content]);
  }
}
for (const [target, content] of outputs) writeFileSync(target, content);
process.stdout.write(`Extracted ${outputs.length} working drafts without publishing them.\n`);
