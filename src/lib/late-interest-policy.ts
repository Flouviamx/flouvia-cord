export interface LateInterestPolicy {
    enabled: boolean;
    maxMonthlyPct: number;
    reason: 'jurisdiction_review_required';
}

/**
 * El interés moratorio automático permanece cerrado hasta que cada país tenga
 * una política jurídica aprobada y versionada. El `countryCode` forma parte de
 * la firma para que habilitar un país requiera una decisión explícita aquí, no
 * un cambio accidental en la UI o el cron.
 */
export function lateInterestPolicy(_countryCode: unknown): LateInterestPolicy {
    return { enabled: false, maxMonthlyPct: 0, reason: 'jurisdiction_review_required' };
}

export function validateLateInterestRate(countryCode: unknown, value: unknown):
    | { ok: true; rate: number }
    | { ok: false; error: string } {
    const rate = Number(value);
    if (!Number.isFinite(rate) || rate < 0) {
        return { ok: false, error: 'La tasa de interés moratorio no es válida' };
    }
    if (rate === 0) return { ok: true, rate: 0 };

    const policy = lateInterestPolicy(countryCode);
    if (!policy.enabled) {
        return {
            ok: false,
            error: 'El interés moratorio automático está suspendido hasta concluir la revisión jurídica de tu país',
        };
    }
    if (rate > policy.maxMonthlyPct) {
        return { ok: false, error: `La tasa mensual no puede superar ${policy.maxMonthlyPct}%` };
    }
    return { ok: true, rate };
}
