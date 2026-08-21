// src/lib/timezones.ts
// Catálogo de zonas horarias para el selector de Ajustes › General.
//
// El control anterior era un `<select>` de ~418 opciones planas ordenadas por
// el id IANA crudo ("America — Mexico City"): no decía el offset UTC ni a qué
// país pertenece la zona, que es exactamente lo que alguien necesita para
// elegir la suya. Este módulo arma el dato completo — ciudad, offset y país —
// desde ICU, sin tablas a mano que se desactualicen con cada cambio de tzdata.
//
// Consumidores: `src/pages/app/ajustes/general.astro` (el selector) y
// `src/pages/api/org.ts` (validación del POST). La zona resuelta la aplica
// `src/lib/fmt-server.ts` vía `currentTimeZone()` — regla 24.

import { getCountryProfile } from './countries';

export interface TimeZoneOption {
    /** Id IANA — el valor que se guarda en `orgs.zona_horaria`. */
    id: string;
    /** Ciudad, del último segmento del id: "Buenos Aires", "Ciudad de México". */
    city: string;
    /** Offset ya formateado y listo para pintar: "UTC−06:00". */
    offset: string;
    /** ISO del país al que pertenece la zona; '' para UTC. */
    countryCode: string;
    /** País localizado: "México", "United States". '' para UTC. */
    country: string;
    /** Minutos respecto a UTC — solo para ordenar. */
    offsetMinutes: number;
}

/** Guion MENOS tipográfico (U+2212), no el guion corto: alinea en tabular. */
const MINUS = '−';

/**
 * Zona IANA → países que la usan.
 *
 * `Intl.supportedValuesOf('timeZone')` da las zonas pero no el país, y no hay
 * API inversa. La que sí existe es `Intl.Locale#getTimeZones()`, que va de
 * región a zonas — así que se barren las 676 combinaciones AA–ZZ una sola vez
 * y se invierte el resultado. Cubre las 418 zonas (273 regiones responden) en
 * ~120 ms, y por eso vive en un módulo cacheado y no dentro de un render.
 */
let zoneCountries: Map<string, string[]> | null = null;

function getZoneCountries(): Map<string, string[]> {
    if (zoneCountries) return zoneCountries;
    const map = new Map<string, string[]>();
    const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const a of A) {
        for (const b of A) {
            const code = a + b;
            let zones: string[] | undefined;
            try {
                zones = (new Intl.Locale(`und-${code}`) as any).getTimeZones?.();
            } catch {
                continue; // región inexistente para ICU
            }
            if (!zones?.length) continue;
            for (const zone of zones) {
                const list = map.get(zone);
                if (list) { if (!list.includes(code)) list.push(code); }
                else map.set(zone, [code]);
            }
        }
    }
    zoneCountries = map;
    return map;
}

/**
 * Offset actual de una zona, en minutos respecto a UTC.
 * Se calcula con ICU y no con una tabla: el horario de verano lo mueve dos
 * veces al año y una constante mentiría medio año.
 */
function offsetMinutesOf(zone: string, at: Date): number {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
        .formatToParts(at)
        .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
    // 'GMT' seco = UTC; si no, 'GMT-06:00' / 'GMT+05:30'.
    const match = name.match(/GMT([+-])(\d{2}):(\d{2})/);
    if (!match) return 0;
    const sign = match[1] === '-' ? -1 : 1;
    return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function formatOffset(minutes: number): string {
    const sign = minutes < 0 ? MINUS : '+';
    const abs = Math.abs(minutes);
    return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/**
 * Ciudad legible desde el id IANA. Se toma el ÚLTIMO segmento, no el primero:
 * con `.replace('/', ' — ')` —que además solo sustituye la primera diagonal—
 * `America/Argentina/Buenos_Aires` se leía "America — Argentina/Buenos Aires".
 */
function cityOf(zone: string): string {
    return (zone.split('/').pop() ?? zone).replaceAll('_', ' ');
}

/**
 * Id canónico de una zona según ICU. `Asia/Kolkata` y
 * `America/Argentina/Buenos_Aires` son alias válidos que `supportedValuesOf`
 * no lista; sin canonizar, una org guardada con uno de ellos no encontraría su
 * zona en el catálogo.
 */
export function canonicalZone(zone: string): string {
    try {
        return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone || zone;
    } catch {
        return zone;
    }
}

const listCache = new Map<string, TimeZoneOption[]>();

/**
 * Catálogo completo, ordenado por offset y luego por ciudad. Si se pasa
 * `featuredCountry`, las zonas de ese país encabezan la lista: el caso normal
 * es elegir una zona del país donde opera el negocio.
 *
 * La clave de caché incluye la hora UTC en curso para que un cambio de horario
 * de verano entre a más tardar en una hora, sin recalcular 418 offsets en cada
 * render de Ajustes.
 */
export function listTimeZones(
    locale: 'es' | 'en' = 'es',
    featuredCountry = '',
    ensure = '',
): TimeZoneOption[] {
    const now = new Date();
    const hourKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`;
    const country = String(featuredCountry || '').toUpperCase();
    // `ensure` es la zona que la org YA tiene guardada. ICU canoniza los ids y
    // `supportedValuesOf` devuelve solo esos: una cuenta con 'Asia/Kolkata' o
    // 'America/Argentina/Buenos_Aires' —alias válidos que el motor acepta— no
    // encontraría su propia zona en la lista, y el selector se vería en blanco.
    // ICU canoniza los alias ('Asia/Kolkata' → 'Asia/Calcutta'), así que primero
    // se intenta resolver al id que el catálogo SÍ trae: así la zona guardada
    // sale con su país y su bandera en vez de como una fila huérfana. Solo si el
    // alias no canoniza a nada conocido se agrega tal cual.
    const extra = ensure && isValidTimeZone(ensure) ? canonicalZone(ensure) : '';
    const cacheKey = `${locale}:${country}:${extra}:${hourKey}`;
    const hit = listCache.get(cacheKey);
    if (hit) return hit;

    const regionNames = new Intl.DisplayNames([locale === 'en' ? 'en-US' : 'es-MX'], { type: 'region' });
    const countriesByZone = getZoneCountries();

    const ids = Intl.supportedValuesOf('timeZone');
    const all = extra && !ids.includes(extra) && extra !== 'UTC' ? [...ids, extra] : ids;

    const options: TimeZoneOption[] = all.map((id) => {
        const codes = countriesByZone.get(id) ?? [];
        // Nombres, no códigos: 'GB' y 'UK' son la misma bandera y el mismo país,
        // y sin deduplicar por nombre la fila decía "United Kingdom, United Kingdom".
        const names: string[] = [];
        for (const code of codes) {
            let name: string;
            try { name = regionNames.of(code) || code; } catch { name = code; }
            if (!names.includes(name)) names.push(name);
        }
        const offsetMinutes = offsetMinutesOf(id, now);
        return {
            id,
            city: cityOf(id),
            offset: formatOffset(offsetMinutes),
            countryCode: codes[0] ?? '',
            country: names.join(', '),
            offsetMinutes,
        };
    });

    options.sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.city.localeCompare(b.city));

    // `Intl.supportedValuesOf` incluye 'UTC' en unas versiones de ICU y en otras
    // no: se quita siempre y se antepone una sola vez, para que no salga
    // duplicada ni dependa de la versión del runtime.
    const zones = options.filter((z) => z.id !== 'UTC');
    const featured = country ? zones.filter((z) => z.countryCode === country) : [];
    const rest = featured.length ? zones.filter((z) => z.countryCode !== country) : zones;

    const utc: TimeZoneOption = {
        id: 'UTC', city: 'UTC', offset: formatOffset(0),
        countryCode: '', country: '', offsetMinutes: 0,
    };

    const list = [utc, ...featured, ...rest];

    listCache.set(cacheKey, list);
    // La caché se llavea por hora: sin poda crecería una entrada por hora y por
    // combinación idioma/país durante toda la vida del proceso.
    if (listCache.size > 48) {
        for (const key of listCache.keys()) {
            if (key !== cacheKey) listCache.delete(key);
            if (listCache.size <= 48) break;
        }
    }
    return list;
}

let validIds: Set<string> | null = null;

/** ¿Es un id IANA real? Único guardián de lo que entra a `orgs.zona_horaria`. */
export function isValidTimeZone(zone: unknown): zone is string {
    if (typeof zone !== 'string' || !zone) return false;
    if (!validIds) validIds = new Set(['UTC', ...Intl.supportedValuesOf('timeZone')]);
    if (validIds.has(zone)) return true;
    // Alias heredados que ICU acepta pero que no aparecen en el catálogo
    // canónico (ej. 'Asia/Calcutta'): si el motor lo formatea, es válido.
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}

/** Zona por defecto de un país, desde su perfil. Fallback para país sin zona. */
export function defaultTimeZoneFor(countryCode: string): string {
    return getCountryProfile(countryCode).timeZone;
}
