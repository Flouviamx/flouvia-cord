// Sales tax de EE. UU.: lo que los editores de cotizaciones y facturas
// necesitan saber en el SSR para pintar la vista previa (src/lib/us-tax-client.ts).
//
// `activo` sigue a la PREFERENCIA con plan vigente, no a "todo listo": si el
// negocio la encendió y luego le falta un dato (venció la configuración, se
// dio de baja la cuenta), el editor pide el cálculo igual y el servidor
// responde qué falta. Así el vendedor lo lee en el resumen, antes de guardar,
// en vez de descubrirlo en un error al enviar.

import type { UsTaxBoot } from '../us-tax-client';
import { usTaxStatus } from './config';

export async function usTaxEditorBoot(
    orgId: string,
    pais: string,
    clientes: { id: string; countryCode?: string | null }[],
    locale: string,
): Promise<UsTaxBoot | null> {
    if (String(pais || '').toUpperCase() !== 'US') return null;
    const st = await usTaxStatus(orgId);
    if (!st.config.auto || !st.entitled) return null;
    const en = String(locale).startsWith('en');
    return {
        activo: true,
        // Un cliente sin país hereda el del negocio, igual que en sus facturas.
        clientesUs: clientes
            .filter((c) => !c.countryCode || String(c.countryCode).toUpperCase() === 'US')
            .map((c) => c.id),
        i18n: {
            calculando: en ? 'Calculating sales tax for the client’s address…' : 'Calculando el sales tax por la dirección del cliente…',
            noDisponible: en
                ? 'Automatic sales tax is not available right now. Try again in a few minutes.'
                : 'El cálculo automático del sales tax no está disponible en este momento. Intenta de nuevo en unos minutos.',
            auto: en ? 'By address' : 'Por dirección',
        },
    };
}
