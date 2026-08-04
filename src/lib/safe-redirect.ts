// Solo permite redirigir a un path RELATIVO propio del sitio — mismo criterio
// que `safeRedirect()` en los componentes de cliente (CustomSignIn/
// CustomSignUp). Usado por los callbacks de OAuth (Google/Apple) para que
// `?redirect_url=` sobreviva el roundtrip a Google/Apple sin abrir un
// open-redirect.
export function safeRelativeRedirect(raw: string | null | undefined): string | null {
    if (!raw) return null;
    if (!raw.startsWith('/') || raw.startsWith('//')) return null;
    return raw;
}
