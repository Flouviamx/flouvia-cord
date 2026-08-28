import { createHash } from 'node:crypto';
import { trustedIp } from './ip';
import { rateLimit, strictLimitResponse, strictRateLimit, tooMany } from './ratelimit';

const keyPart = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 24);

export async function limitConnectMutation(
    request: Request,
    scope: string,
    principal: string,
    limit = 20,
): Promise<Response | null> {
    const ip = trustedIp(request);
    const [principalResult, ipResult] = await Promise.all([
        strictRateLimit(`connect:${scope}:principal:${keyPart(principal)}`, limit, 60),
        strictRateLimit(`connect:${scope}:ip:${keyPart(ip)}`, Math.max(limit * 3, 30), 60),
    ]);
    return strictLimitResponse(!principalResult.ok ? principalResult : ipResult);
}

export async function limitConnectRead(request: Request, scope: string, principal: string): Promise<Response | null> {
    const result = await rateLimit(`connect-read:${scope}:${keyPart(principal)}:${keyPart(trustedIp(request))}`, 120, 60);
    return result.ok ? null : tooMany(result.retryAfter);
}

/**
 * Rate limit del carril PÚBLICO de pago (`/api/q/*`, `/api/i/*`).
 *
 * Antes cada endpoint llamaba a `rateLimit()` a secas con una clave que sólo
 * llevaba el TOKEN. Dos huecos:
 *
 *   · `rateLimit()` falla ABIERTO. Si el backend de conteo no responde, el
 *     límite desaparece — justo en el carril donde vive el fraude de prueba de
 *     tarjetas (enumerar números robados contra un endpoint de pago).
 *   · Sin componente de IP, un atacante con muchos enlaces públicos y un
 *     comprador legítimo detrás de un NAT compartido se miden igual.
 *
 * Se usa `strictRateLimit` (falla CERRADO en producción) y eso aquí no es una
 * regresión de disponibilidad: su respaldo es la misma base de datos que el
 * endpoint necesita dos líneas después para resolver la cotización. Si Postgres
 * no responde, el cobro no iba a poder crearse de todas formas.
 *
 * El límite por IP es deliberadamente holgado: quien paga hace uno o dos
 * intentos, y una oficina entera detrás de la misma IP saliente sigue cabiendo.
 */
export async function limitPublicPayment(
    request: Request,
    scope: string,
    token: string,
    limit = 10,
): Promise<Response | null> {
    const ip = trustedIp(request);
    const [porToken, porIp] = await Promise.all([
        strictRateLimit(`pay:${scope}:token:${keyPart(token)}`, limit, 60),
        strictRateLimit(`pay:${scope}:ip:${keyPart(ip)}`, Math.max(limit * 4, 40), 60),
    ]);
    return strictLimitResponse(!porToken.ok ? porToken : porIp);
}
