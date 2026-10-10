// Idioma, formato, divisa y zona horaria de UNA organización para trabajo que
// corre fuera de su sesión: crons que barren varias cuentas, el carril de la
// API pública. En /app el middleware ya los fija desde la organización activa
// (resolvePresentationContext en db.ts); en un cron no hay organización activa
// y `currentLocale()` caía a español, así que una cuenta configurada en inglés
// recibía en español los recordatorios y las facturas recurrentes.
//
// El contexto es ANIDADO y dura lo que dura `fn`: nunca se fija para toda la
// corrida, porque la siguiente organización del barrido puede hablar otro
// idioma. Se parte del contexto del llamador (conserva el carril de sistema del
// cron) con la presentación vaciada, para que nada se herede de otra cuenta.

import { sql, withOrgTx } from './db';
import { reqContext, setRequestCurrency, setRequestFormatLocale, setRequestLocale, setRequestTimeZone } from './context';
import { getCountryProfile } from './countries';
import { log } from './log';

export interface OrgPresentation {
    idioma?: string | null;
    moneda?: string | null;
    zona_horaria?: string | null;
    country_code?: string | null;
}

/** Corre `fn` con la presentación dada (los setters descartan valores inválidos). */
export function withPresentation<T>(p: OrgPresentation, fn: () => Promise<T>): Promise<T> {
    const parent = reqContext.getStore();
    const store = {
        ...(parent ?? { userId: null }),
        locale: undefined, formatLocale: undefined, currency: undefined, timeZone: undefined,
    };
    return reqContext.run(store, () => {
        setRequestLocale(p.idioma);
        setRequestFormatLocale(getCountryProfile(String(p.country_code || 'MX')).locale);
        setRequestCurrency(p.moneda);
        setRequestTimeZone(p.zona_horaria);
        return fn();
    });
}

/** Lee la presentación de la organización y corre `fn` con ella. */
export async function withOrgPresentation<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
    let p: OrgPresentation = {};
    try {
        const [[row]] = await withOrgTx(orgId, sql`
            select idioma, moneda, zona_horaria, country_code from orgs where id = ${orgId} limit 1`);
        if (row) p = row as OrgPresentation;
    } catch (err) {
        // No tumba el trabajo de la organización: sale con los defaults, y queda
        // registrado porque un correo en el idioma equivocado es un bug.
        log.warn('no se pudo leer la presentación de la organización', { route: 'org-presentation', orgId, err });
    }
    return withPresentation(p, fn);
}
