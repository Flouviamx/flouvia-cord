// Utilidades HTTP de /api/informes/guardados: quién pide y errores traducidos.
import { getActiveOrgId } from './db';
import { currentLocale, currentUserId } from './context';
import { getMyMembership } from './queries';
import { t } from '../i18n/app';
import type { GuardadoError } from './informes-guardados';

export async function actor() {
    const [orgId, me] = await Promise.all([getActiveOrgId(), getMyMembership()]);
    return { orgId, userId: currentUserId(), rol: me.rol };
}

export function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
}

/** El código de error se traduce aquí, en el idioma de la cuenta (regla 36). */
export function fail(status: number, code: GuardadoError) {
    return json({ error: t(currentLocale(), ('inf.g.err.' + code) as any), code }, status);
}
