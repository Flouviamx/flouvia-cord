// Construcción del emisor y el receptor de un documento fiscal.
//
// Vivía duplicado, idéntico, en emit.ts e invoices.ts — con el mismo bug en los
// dos sitios: `recipient.address.countryCode` se llenaba con el país del
// EMISOR (`country`, el parámetro), nunca con el del cliente. Un cliente
// estadounidense de una empresa española quedaba registrado como español en
// la factura, y como `clientes` no tenía dirección, el bloque "Bill To" salía
// con una sola línea: el nombre del país del emisor.
//
// `head` es la fila híbrida `orgs` + `clientes` que arma cada query — todas
// deben incluir los alias `cliente_country_code`, `cliente_direccion_line1/2`,
// `cliente_ciudad`, `cliente_region` para que este módulo tenga con qué llenar
// la dirección real del receptor.

import type { FiscalParty } from './index';
import { isEuCountry } from '../countries';
import { splitEInvoiceAddress } from './einvoice/codes';

export function metadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === 'string')
    .map(([key, item]) => [key, String(item)]));
}

export function partiesFrom(head: any, issuerCountry: string): { issuer: FiscalParty; recipient: FiscalParty } {
  const fiscalMetadata = metadata(head.fiscal_metadata);
  // El país del cliente es el suyo si lo capturó; si no, hereda el del emisor
  // (mismo comportamiento que antes de que `clientes.country_code` existiera).
  const recipientCountry = head.cliente_country_code
    ? String(head.cliente_country_code).toUpperCase()
    : issuerCountry;
  return {
    issuer: {
      legalName: fiscalMetadata.legal_name || String(head.org_razon_social || head.org_nombre || 'Emisor'),
      taxId: fiscalMetadata.tax_id || (head.org_tax_id ? String(head.org_tax_id) : undefined),
      taxSystem: head.org_tax_system ? String(head.org_tax_system) : undefined,
      ...((issuerCountry === 'FR' || issuerCountry === 'DE') && fiscalMetadata.vat_regime === 'small_business'
        ? { vatRegime: 'small_business' as const } : {}),
      // Francia: la opción por pagar la TVA sobre los débitos (art. 269-2-c del
      // CGI) es una mención de la factura desde la reforma (BT-8) y decide qué
      // cobros se reportan; se congela con el emisor.
      ...(issuerCountry === 'FR' && fiscalMetadata.fr_tva_debits === 'true' ? { vatOnDebits: true } : {}),
      ...(issuerCountry === 'CA' && fiscalMetadata.qst_number
        ? { extraTaxIds: [{ kind: 'qst' as const, value: fiscalMetadata.qst_number }] } : {}),
      email: head.org_email ? String(head.org_email) : undefined,
      // Contacto, dirección electrónica y registro mercantil: los pide la
      // factura electrónica europea (BG-6, BT-34, BT-30) y quedan congelados
      // con el resto del emisor.
      ...(fiscalMetadata.contact_name ? { contactName: fiscalMetadata.contact_name } : {}),
      ...(fiscalMetadata.contact_phone || head.org_telefono ? { phone: fiscalMetadata.contact_phone || String(head.org_telefono) } : {}),
      ...(splitEInvoiceAddress(fiscalMetadata.einvoice_address) ? { electronicAddress: splitEInvoiceAddress(fiscalMetadata.einvoice_address)! } : {}),
      ...(fiscalMetadata.legal_registration_id ? { legalRegistrationId: { id: fiscalMetadata.legal_registration_id } } : {}),
      address: {
        countryCode: issuerCountry,
        line1: fiscalMetadata.address_line1 || (head.org_direccion ? String(head.org_direccion) : undefined),
        line2: fiscalMetadata.address_line2 || undefined,
        city: fiscalMetadata.city || undefined,
        region: fiscalMetadata.region || undefined,
        postalCode: fiscalMetadata.postal_code || (head.org_cp ? String(head.org_cp) : undefined),
      },
    },
    recipient: {
      legalName: String(head.cliente_empresa || head.cliente_contacto || 'Cliente'),
      taxId: head.cliente_rfc ? String(head.cliente_rfc) : undefined,
      taxSystem: head.cliente_regimen ? String(head.cliente_regimen) : undefined,
      email: head.cliente_email ? String(head.cliente_email) : undefined,
      contactName: head.cliente_contacto ? String(head.cliente_contacto) : undefined,
      ...(head.cliente_telefono ? { phone: String(head.cliente_telefono) } : {}),
      ...(splitEInvoiceAddress(head.cliente_einvoice_address) ? { electronicAddress: splitEInvoiceAddress(head.cliente_einvoice_address)! } : {}),
      address: {
        countryCode: recipientCountry,
        line1: head.cliente_direccion_line1 ? String(head.cliente_direccion_line1) : undefined,
        line2: head.cliente_direccion_line2 ? String(head.cliente_direccion_line2) : undefined,
        city: head.cliente_ciudad ? String(head.cliente_ciudad) : undefined,
        region: head.cliente_region ? String(head.cliente_region) : undefined,
        postalCode: head.cliente_cp ? String(head.cliente_cp) : undefined,
      },
    },
  };
}

/**
 * La cuenta para transferencia del emisor tal como está al emitir
 * (`documentos_fiscales.payee_account`, BT-84/BT-86 de la factura electrónica
 * europea). Solo para emisores de la UE, que es donde se usa. El IBAN se copia
 * CIFRADO (`orgs.banco_clabe_enc`): quien genera el XML lo descifra y valida.
 */
export function payeeAccountFrom(head: any, issuerCountry: string): { ibanEnc: string; last4: string; bic?: string; holder?: string } | null {
  if (!isEuCountry(issuerCountry) || !head.org_banco_clabe_enc) return null;
  const fiscalMetadata = metadata(head.fiscal_metadata);
  return {
    ibanEnc: String(head.org_banco_clabe_enc),
    last4: String(head.org_banco_clabe_last4 || ''),
    ...(fiscalMetadata.bic ? { bic: fiscalMetadata.bic } : {}),
    ...(head.org_banco_beneficiario ? { holder: String(head.org_banco_beneficiario) } : {}),
  };
}
