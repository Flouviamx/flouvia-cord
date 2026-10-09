// Ver ts-resolve.mjs.
const SIN_EXTENSION = /^\.{1,2}\/(?:.*\/)?[^/.]+$/;

export async function resolve(specifier, context, next) {
    try {
        return await next(specifier, context);
    } catch (error) {
        const code = error && error.code;
        if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'ERR_UNSUPPORTED_DIR_IMPORT') throw error;
        if (!SIN_EXTENSION.test(specifier)) throw error;
        for (const suffix of ['.ts', '/index.ts']) {
            try {
                return await next(specifier + suffix, context);
            } catch {
                // siguiente candidato
            }
        }
        throw error;
    }
}
