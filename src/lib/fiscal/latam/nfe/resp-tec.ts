// Responsable técnico del sistema emisor (grupo infRespTec) [NT 2018.005]:
// la empresa que desarrolla el software, es decir, Cord. Es un dato del
// DESPLIEGUE, no de la organización: viene de variables de entorno
// (.env.example, sección NF-e) y nunca de Ajustes.
//
//   NFE_RESP_TEC_CNPJ, NFE_RESP_TEC_CONTATO, NFE_RESP_TEC_EMAIL,
//   NFE_RESP_TEC_FONE      — el grupo; sin los cuatro no se informa.
//   NFE_CSRT_<UF>_ID, NFE_CSRT_<UF>
//                          — el Código de Segurança do Responsável Técnico que
//                            emitió la SEFAZ de esa UF (hoy lo exige PR).
//
// AM, MS, PE, PR, SC y TO exigen el grupo (rechazo 972) y PR además el CSRT
// (975); en esos estados, sin la configuración, la NF-e falla cerrado antes
// de numerar con un mensaje que no nombra las variables (regla 14).
//
// Puro: lo cargan el proveedor y los scripts con Node plano.

import { UFS, type Uf } from './constantes.ts';
import type { ResponsavelTecnico } from './nfe.ts';

function env(name: string): string {
    const fromMeta = (import.meta as { env?: Record<string, string | undefined> }).env?.[name];
    return String(fromMeta || (typeof process !== 'undefined' ? process.env?.[name] : '') || '').trim();
}

export function responsavelTecnico(): ResponsavelTecnico | null {
    const cnpj = env('NFE_RESP_TEC_CNPJ').replace(/\D/g, '');
    const contato = env('NFE_RESP_TEC_CONTATO');
    const email = env('NFE_RESP_TEC_EMAIL');
    const fone = env('NFE_RESP_TEC_FONE');
    if (!cnpj || !contato || !email || !fone) return null;
    const csrt: Partial<Record<Uf, { id: string; codigo: string }>> = {};
    for (const uf of UFS) {
        const id = env(`NFE_CSRT_${uf}_ID`);
        const codigo = env(`NFE_CSRT_${uf}`);
        // CSRT: 16 a 36 caracteres alfanuméricos; id de 2 dígitos [NT2018.005 §2.1].
        if (/^[0-9]{2}$/.test(id) && /^[0-9A-Za-z]{16,36}$/.test(codigo)) csrt[uf] = { id, codigo };
    }
    return { cnpj, contato, email, fone, ...(Object.keys(csrt).length ? { csrt } : {}) };
}
