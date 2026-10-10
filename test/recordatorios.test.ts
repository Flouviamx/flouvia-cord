// Calendario de recordatorios de factura: las reglas puras que comparten la
// pantalla de Ajustes, la API que lo guarda y el cron (src/lib/recordatorios.ts).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    ETAPAS_DEFAULT, ETAPAS_PERMITIDAS, MAX_ETAPAS, VENTANA,
    describirEtapas, detalleEventoEtapa, etapaQueToca, etapasGuardadas, momentoDelAviso, validarEtapas,
} from '../src/lib/recordatorios';

const ES = { antes: '{dias} días antes', antesUno: '{dias} día antes', hoy: 'el día del vencimiento', despues: '{dias} días después', despuesUno: '{dias} día después' };
const EN = { antes: '{dias} days before', antesUno: '{dias} day before', hoy: 'on the due date', despues: '{dias} days after', despuesUno: '{dias} day after' };

describe('el calendario por defecto', () => {
    it('es la escalera de siempre, la misma que el default de la columna', () => {
        expect([...ETAPAS_DEFAULT]).toEqual([-7, -1, 3, 7, 14, 30]);
        const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
        const m = /recordatorio_etapas int\[\] not null default '\{([^}]*)\}'/.exec(schema);
        expect(m?.[1].split(',').map(Number)).toEqual([...ETAPAS_DEFAULT]);
        // Todo el default se puede volver a elegir en la pantalla.
        for (const e of ETAPAS_DEFAULT) expect(ETAPAS_PERMITIDAS).toContain(e);
    });

    it('una fila sin calendario se lee como el de siempre', () => {
        expect(etapasGuardadas(null)).toEqual([...ETAPAS_DEFAULT]);
        expect(etapasGuardadas(undefined)).toEqual([...ETAPAS_DEFAULT]);
    });
});

describe('validar lo que se guarda', () => {
    it('acepta el menú cerrado, ordena y quita duplicados', () => {
        expect(validarEtapas([30, -7, 3, -7, 0])).toEqual({ ok: true, etapas: [-7, 0, 3, 30] });
        expect(validarEtapas('-14, -1,0,90')).toEqual({ ok: true, etapas: [-14, -1, 0, 90] });
        expect(validarEtapas(['-3', '60'])).toEqual({ ok: true, etapas: [-3, 60] });
    });

    it('rechaza lo que la pantalla no ofrece', () => {
        expect(validarEtapas([5])).toEqual({ ok: false, error: 'fuera_de_menu' });
        expect(validarEtapas([-30])).toEqual({ ok: false, error: 'fuera_de_menu' });
        expect(validarEtapas([1.5])).toEqual({ ok: false, error: 'formato' });
        expect(validarEtapas(['siete'])).toEqual({ ok: false, error: 'formato' });
        expect(validarEtapas({ etapas: [1] })).toEqual({ ok: false, error: 'formato' });
        expect(validarEtapas(null)).toEqual({ ok: false, error: 'formato' });
    });

    it('exige al menos una etapa y como máximo el tope', () => {
        expect(validarEtapas([])).toEqual({ ok: false, error: 'vacio' });
        expect(validarEtapas('')).toEqual({ ok: false, error: 'vacio' });
        expect(MAX_ETAPAS).toBe(8);
        expect(validarEtapas([-14, -7, -3, -1, 0, 1, 3, 7])).toMatchObject({ ok: true });
        expect(validarEtapas([-14, -7, -3, -1, 0, 1, 3, 7, 14])).toEqual({ ok: false, error: 'demasiadas' });
    });

    it('conserva una etapa ya guardada fuera del menú, pero no deja agregar otra', () => {
        expect(validarEtapas([-7, 5], [-7, 5])).toEqual({ ok: true, etapas: [-7, 5] });
        expect(validarEtapas([-7, 5], [-7])).toEqual({ ok: false, error: 'fuera_de_menu' });
        // Ni guardada se acepta lo que el cron no evalúa.
        expect(validarEtapas([200], [200])).toEqual({ ok: false, error: 'fuera_de_menu' });
    });

    it('lo guardado se lee sin recortar al menú, solo a la ventana que el cron evalúa', () => {
        expect(etapasGuardadas([30, 5, -7, 5, 500, 'x'])).toEqual([-7, 5, 30]);
        expect(VENTANA).toEqual({ min: -30, max: 120 });
    });
});

describe('qué etapa toca hoy', () => {
    const d = [...ETAPAS_DEFAULT];
    it('recorre la escalera de siempre, una etapa por día que se alcanza', () => {
        expect(etapaQueToca(d, -8, [])).toBeNull();
        expect(etapaQueToca(d, -7, [])).toBe(-7);
        expect(etapaQueToca(d, -6, [-7])).toBeNull();
        expect(etapaQueToca(d, -1, [-7])).toBe(-1);
        expect(etapaQueToca(d, 0, [-7, -1])).toBeNull();
        expect(etapaQueToca(d, 3, [-7, -1])).toBe(3);
        expect(etapaQueToca(d, 30, [-7, -1, 3, 7, 14])).toBe(30);
        expect(etapaQueToca(d, 45, [-7, -1, 3, 7, 14, 30])).toBeNull();
    });

    it('una factura que entra tarde recibe solo la etapa más reciente', () => {
        expect(etapaQueToca(d, 20, [])).toBe(14);
    });

    it('cambiar el calendario nunca repite ni manda una etapa atrasada', () => {
        // Ya salió el de 7 días antes; agregar 14 días antes no manda un aviso viejo.
        expect(etapaQueToca([-14, -7, -1], -5, [-7])).toBeNull();
        // Ya salió el de 3 días vencida; agregar "1 día después" no lo manda.
        expect(etapaQueToca([1, 3, 7], 4, [-7, -1, 3])).toBeNull();
        // Una etapa ya enviada nunca vuelve, aunque siga en el calendario.
        expect(etapaQueToca([3], 3, [3])).toBeNull();
        // Una etapa nueva POSTERIOR a lo ya enviado sí sale.
        expect(etapaQueToca([3, 60], 61, [-7, -1, 3, 7, 14, 30])).toBe(60);
    });

    it('el día del vencimiento es una etapa propia', () => {
        expect(etapaQueToca([-1, 0, 1], 0, [-1])).toBe(0);
        expect(momentoDelAviso(-3)).toBe('antes');
        expect(momentoDelAviso(0)).toBe('hoy');
        expect(momentoDelAviso(2)).toBe('vencida');
    });
});

describe('textos', () => {
    it('la vista previa concuerda la unidad con el número que la precede', () => {
        expect(describirEtapas([-7, -1, 3, 7, 14, 30], ES, 'es')).toBe('7 y 1 día antes; 3, 7, 14 y 30 días después');
        expect(describirEtapas([-14, -7, 0, 1], ES, 'es')).toBe('14 y 7 días antes; el día del vencimiento; 1 día después');
        expect(describirEtapas([-3, 0, 90], EN, 'en')).toBe('3 days before; on the due date; 90 days after');
        expect(describirEtapas([-7, -1, 3, 7, 14, 30], EN, 'en')).toBe('7 and 1 day before; 3, 7, 14, and 30 days after');
        expect(describirEtapas([], ES, 'es')).toBe('');
    });

    it('la línea de tiempo dice la etapa con su plural', () => {
        expect(detalleEventoEtapa(-7)).toBe('Aviso de vencimiento (7 días antes)');
        expect(detalleEventoEtapa(-1)).toBe('Aviso de vencimiento (1 día antes)');
        expect(detalleEventoEtapa(0)).toBe('Aviso de vencimiento (vence hoy)');
        expect(detalleEventoEtapa(1)).toBe('Recordatorio de cobro (1 día vencida)');
        expect(detalleEventoEtapa(30)).toBe('Recordatorio de cobro (30 días vencida)');
    });
});
