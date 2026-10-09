// Punto de entrada común: ¿el riel regulatorio del país está listo para esta
// organización? Lo consulta document-kind.ts para decidir si un documento nace
// fiscal o comercial. Cada riel nuevo agrega aquí su caso; un riel sin función
// de estado nunca está listo (falla cerrado).

import { rielesDePais, type RailId } from './rieles';

export async function railListo(orgId: string, rail: RailId): Promise<boolean> {
    switch (rail) {
        case 'arca': {
            const { arcaListo } = await import('./arca/estado');
            return arcaListo(orgId);
        }
        case 'nfse': {
            const { nfseListo } = await import('./nfse/estado');
            return nfseListo(orgId);
        }
        case 'sunat': {
            const { sunatListo } = await import('./sunat/estado');
            return sunatListo(orgId);
        }
        case 'sii': {
            const { siiListo } = await import('./sii/estado');
            return siiListo(orgId);
        }
        case 'dian': {
            const { dianListo } = await import('./dian/estado');
            return dianListo(orgId);
        }
        case 'nfe': {
            const { nfeListo } = await import('./nfe/estado');
            return nfeListo(orgId);
        }
        default:
            return false;
    }
}

/** El país tiene riel y está listo para la organización (en Brasil, cualquiera de sus dos). */
export async function railListoParaPais(orgId: string, country: string): Promise<boolean> {
    for (const rail of rielesDePais(country)) {
        if (await railListo(orgId, rail.id)) return true;
    }
    return false;
}
