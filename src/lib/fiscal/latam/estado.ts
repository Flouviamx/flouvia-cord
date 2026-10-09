// Punto de entrada común: ¿el riel regulatorio del país está listo para esta
// organización? Lo consulta document-kind.ts para decidir si un documento nace
// fiscal o comercial. Cada riel nuevo agrega aquí su caso; un riel sin función
// de estado nunca está listo (falla cerrado).

import { railDePais, type RailId } from './rieles';

export async function railListo(orgId: string, rail: RailId): Promise<boolean> {
    switch (rail) {
        case 'arca': {
            const { arcaListo } = await import('./arca/estado');
            return arcaListo(orgId);
        }
        case 'sii': {
            const { siiListo } = await import('./sii/estado');
            return siiListo(orgId);
        }
        default:
            return false;
    }
}

/** El país tiene riel y está listo para la organización. */
export async function railListoParaPais(orgId: string, country: string): Promise<boolean> {
    const rail = railDePais(country);
    return rail ? railListo(orgId, rail.id) : false;
}
