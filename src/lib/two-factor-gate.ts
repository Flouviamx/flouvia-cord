// Excepciones de recuperación exactas: no abren /api/account/* ni /api/org.
// Los propios handlers siguen verificando sesión, CSRF y su autorización.
export function isTwoFactorRecoveryApi(path: string, method: string): boolean {
    return method === 'POST' && [
        '/api/account/2fa/start',
        '/api/account/2fa/verify',
        '/api/account/reauthenticate',
        '/api/auth/logout',
    ].includes(path);
}
