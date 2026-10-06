import { describe, it, expect } from 'vitest';
import { parseArgs, checkForwardUrl, checkTestKey, maskKey, parseEventList, configPath, sameOrigin, describeCounts } from '../packages/cli/src/lib';

describe('cord CLI', () => {
    it('parsea comandos y banderas', () => {
        expect(parseArgs(['listen', '--forward-to', 'http://localhost:3000', '--events=quote.paid,invoice.paid', '--allow-remote'])).toEqual({
            command: ['listen'],
            flags: { 'forward-to': 'http://localhost:3000', events: 'quote.paid,invoice.paid', 'allow-remote': true },
        });
        expect(parseEventList('a, b,,c')).toEqual(['a', 'b', 'c']);
    });

    it('solo acepta llaves de prueba', () => {
        expect(checkTestKey('sk_test_abcdefghijklmnop1234').ok).toBe(true);
        expect(checkTestKey('sk_live_abcdefghijklmnop1234').ok).toBe(false);
        expect(checkTestKey('pk_test_abcdefghijklmnop1234').ok).toBe(false);
        expect(checkTestKey('sk_test_x').ok).toBe(false);
        expect(checkTestKey('rk_test_abcdefghijklmnop1234').ok).toBe(true);
        expect(checkTestKey('rk_live_abcdefghijklmnop1234').ok).toBe(false);
    });

    it('reenvía solo a la máquina local salvo que se pida', () => {
        for (const u of ['http://localhost:3000/hooks', 'http://127.0.0.1:8080', 'http://[::1]:3000', 'http://app.localhost']) expect(checkForwardUrl(u).ok, u).toBe(true);
        expect(checkForwardUrl('https://ngrok.example/hooks').ok).toBe(false);
        expect(checkForwardUrl('https://ngrok.example/hooks', true).ok).toBe(true);
        expect(checkForwardUrl('file:///etc/passwd', true).ok).toBe(false);
        expect(checkForwardUrl('http://user:pw@localhost').ok).toBe(false);
    });

    it('nunca muestra la llave completa', () => {
        expect(maskKey('sk_test_abcdefghijklmnop1234')).toBe('sk_test_…1234');
    });

    it('solo abre en el navegador URLs del mismo origen que la API', () => {
        expect(sameOrigin('https://cordhq.app/app/cli/autorizar?codigo=X', 'https://cordhq.app')).toBe(true);
        expect(sameOrigin('https://evil.example/app', 'https://cordhq.app')).toBe(false);
        expect(sameOrigin('http://cordhq.app/app', 'https://cordhq.app')).toBe(false);
        expect(sameOrigin('http://localhost:4321/app', 'http://localhost:4321')).toBe(true);
        expect(sameOrigin('javascript:alert(1)', 'https://cordhq.app')).toBe(false);
    });

    it('resume la propuesta en lenguaje humano', () => {
        expect(describeCounts({ perfil: 4, impuestos: 1, productos: 0, plantillas: 2 })).toEqual(['4 datos del perfil', '1 impuesto', '2 plantillas']);
        expect(describeCounts({})).toEqual([]);
    });

    it('respeta XDG_CONFIG_HOME', () => {
        expect(configPath({ XDG_CONFIG_HOME: '/tmp/x' } as any)).toBe('/tmp/x/cord/config.json');
    });
});

import { detectFramework, planInit, envIsIgnored, installCommand } from '../packages/cli/src/init';

describe('cord init', () => {
    const base = { hasAppDir: false, hasSrcDir: false, lockfiles: [] as string[] };

    it('detecta el framework', () => {
        expect(detectFramework({ ...base, hasAppDir: true, packageJson: { dependencies: { next: '15' } } })).toBe('next-app');
        expect(detectFramework({ ...base, packageJson: { dependencies: { astro: '5' } } })).toBe('astro');
        expect(detectFramework({ ...base, composerJson: { require: { 'laravel/framework': '^11' } } })).toBe('laravel');
        expect(detectFramework({ ...base, pythonDeps: 'Django==5.0' })).toBe('django');
        expect(detectFramework(base)).toBe('unknown');
    });

    it('usa el gestor de paquetes del proyecto', () => {
        expect(installCommand('next-app', ['pnpm-lock.yaml'])).toMatch(/^pnpm add/);
        expect(installCommand('laravel', [])).toBe('composer require flouviahq/cord');
    });

    it('solo escribe la llave en un archivo ignorado por git', () => {
        expect(envIsIgnored('.env*.local\nnode_modules', '.env.local')).toBe(true);
        expect(envIsIgnored('node_modules', '.env.local')).toBe(false);
        expect(envIsIgnored(undefined, '.env')).toBe(false);
        const plan = planInit({ ...base, hasAppDir: true, packageJson: { dependencies: { next: '15' } }, gitignore: 'node_modules' });
        expect(plan.envFile).toBeNull();
    });

    it('en Next App Router crea el webhook verificado y el proxy', () => {
        const plan = planInit({ ...base, hasAppDir: true, hasSrcDir: true, packageJson: { dependencies: { next: '15' } }, gitignore: '.env*.local' });
        expect(plan.files.map((f) => f.path)).toEqual(['src/app/api/webhooks/cord/route.ts', 'src/app/api/cord/[...path]/route.ts']);
        expect(plan.files[0].content).toContain('constructEvent(await request.text()');
        expect(plan.envFile).toBe('.env.local');
    });
});
