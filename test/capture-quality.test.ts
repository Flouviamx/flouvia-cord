import { describe, it, expect } from 'vitest';
import { medir, evaluar, consejo, UMBRALES } from '../src/lib/capture-quality';

// Buffers RGBA sintéticos. Cada patrón está construido para aislar UNA métrica,
// para que un fallo diga cuál de ellas se rompió.

function lienzo(ancho: number, alto: number, pintar: (x: number, y: number) => [number, number, number]) {
    const d = new Uint8ClampedArray(ancho * alto * 4);
    for (let y = 0; y < alto; y++) {
        for (let x = 0; x < ancho; x++) {
            const [r, g, b] = pintar(x, y);
            const p = (y * ancho + x) * 4;
            d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
        }
    }
    return d;
}

const W = 64, H = 48, LADO = 1600;
const plano = (v: number) => lienzo(W, H, () => [v, v, v]);
const tablero = () => lienzo(W, H, (x, y) => (((x >> 1) + (y >> 1)) % 2 ? [250, 250, 250] : [5, 5, 5]));
const gradiente = () => lienzo(W, H, (x) => { const v = Math.round((x / W) * 255); return [v, v, v]; });
const colorido = () => lienzo(W, H, (x, y) => (((x >> 1) + (y >> 1)) % 2 ? [230, 40, 40] : [20, 60, 220]));

describe('medir — nitidez', () => {
    it('un tablero tiene mucha más varianza del laplaciano que un gradiente', () => {
        const nitido = medir(tablero(), W, H, LADO).nitidez;
        const suave = medir(gradiente(), W, H, LADO).nitidez;
        expect(nitido).toBeGreaterThan(suave);
        expect(suave).toBeLessThan(UMBRALES.nitidezDudosa);
    });

    it('un plano uniforme no tiene detalle alguno', () => {
        expect(medir(plano(128), W, H, LADO).nitidez).toBe(0);
    });
});

describe('medir — exposición', () => {
    it('lee la mediana de luminancia', () => {
        expect(medir(plano(200), W, H, LADO).brillo).toBeGreaterThan(190);
        expect(medir(plano(10), W, H, LADO).brillo).toBeLessThan(20);
    });

    it('un plano no tiene contraste', () => {
        expect(medir(plano(128), W, H, LADO).contraste).toBe(0);
    });

    it('un gradiente completo sí lo tiene', () => {
        expect(medir(gradiente(), W, H, LADO).contraste).toBeGreaterThan(UMBRALES.contrasteMin);
    });

    it('cuenta los píxeles muy oscuros', () => {
        expect(medir(plano(5), W, H, LADO).oscuro).toBeCloseTo(1, 1);
        expect(medir(plano(200), W, H, LADO).oscuro).toBe(0);
    });
});

describe('medir — reflejo y color', () => {
    it('sólo cuenta como reflejo cuando los TRES canales están saturados', () => {
        // Blanco puro: recorte real.
        expect(medir(plano(255), W, H, LADO).reflejo).toBeCloseTo(1, 1);
        // Amarillo intenso: dos canales saturados, uno no. No es especular.
        const amarillo = lienzo(W, H, () => [255, 255, 30]);
        expect(medir(amarillo, W, H, LADO).reflejo).toBe(0);
    });

    it('distingue una imagen sin color de una con color', () => {
        expect(medir(plano(128), W, H, LADO).croma).toBe(0);
        expect(medir(tablero(), W, H, LADO).croma).toBe(0);
        expect(medir(colorido(), W, H, LADO).croma).toBeGreaterThan(UMBRALES.cromaGris);
    });

    it('no revienta con un buffer vacío o inconsistente', () => {
        expect(medir(new Uint8ClampedArray(0), 0, 0, 0).nitidez).toBe(0);
        expect(medir(new Uint8ClampedArray(4), 100, 100, LADO).oscuro).toBe(1);
    });
});

describe('evaluar — qué bloquea y qué sólo avisa', () => {
    const buena = { nitidez: 200, brillo: 140, contraste: 120, reflejo: 0.001, croma: 60, ladoLargo: 1600, oscuro: 0.05 };

    it('una foto buena pasa', () => {
        expect(evaluar(buena, true)).toEqual({ severidad: 'ok', motivo: null });
    });

    // Sólo dos cosas bloquean, y las dos son fracaso GARANTIZADO del lado del
    // proveedor: dejarlas pasar no le ahorra nada al usuario.
    it('bloquea por resolución bajo el piso', () => {
        expect(evaluar({ ...buena, ladoLargo: 400 }, true)).toMatchObject({ severidad: 'bloqueo', motivo: 'resolucion' });
    });

    it('bloquea blanco y negro SÓLO en documento de identidad', () => {
        expect(evaluar({ ...buena, croma: 2 }, true)).toMatchObject({ severidad: 'bloqueo', motivo: 'grises' });
        // Un comprobante de domicilio escaneado en B/N es válido.
        expect(evaluar({ ...buena, croma: 2 }, false).severidad).not.toBe('bloqueo');
    });

    it('lo demás sólo avisa: nunca deja a nadie sin poder cobrar', () => {
        for (const parcial of [
            { nitidez: 10 }, { brillo: 20 }, { contraste: 10 }, { reflejo: 0.5 }, { oscuro: 0.9 },
        ]) {
            const v = evaluar({ ...buena, ...parcial }, true);
            expect(v.severidad, JSON.stringify(parcial)).toBe('aviso');
            expect(consejo(v.motivo!)).not.toBe('');
        }
    });

    it('la oscuridad manda sobre la borrosidad', () => {
        // Una foto oscura sale además borrosa; decir "está movida" manda a la
        // persona a repetir el gesto equivocado.
        expect(evaluar({ ...buena, brillo: 20, nitidez: 5 }, true).motivo).toBe('oscura');
    });

    it('el recorte alto manda sobre la media — un pasaporte beige es legítimo', () => {
        // Brillo alto SIN recorte no es sobreexposición.
        expect(evaluar({ ...buena, brillo: 215 }, true).severidad).toBe('ok');
        expect(evaluar({ ...buena, brillo: 215, reflejo: 0.4 }, true).motivo).toBe('quemada');
    });

    it('avisa cuando es legible pero mejorable', () => {
        expect(evaluar({ ...buena, ladoLargo: 700 }, true).motivo).toBe('mejorable');
    });
});

describe('consejo', () => {
    it('dice qué hacer, en ambos idiomas', () => {
        for (const m of ['resolucion', 'grises', 'oscura', 'quemada', 'reflejo', 'contraste', 'borrosa', 'mejorable']) {
            expect(consejo(m, 'es').length, m).toBeGreaterThan(20);
            expect(consejo(m, 'en').length, m).toBeGreaterThan(20);
        }
    });
    it('devuelve cadena vacía ante un motivo desconocido', () => {
        expect(consejo('inexistente')).toBe('');
    });
});
