import React, { useEffect, useState } from 'react';
import LiveCapture from './LiveCapture';

interface Props {
    locale?: 'es' | 'en';
    token: string;
    orgNombre?: string;
    orgLogo?: string;
    orgColor?: string;
}

type Step = 'loading' | 'notfound' | 'expired' | 'intro' | 'front' | 'back' | 'address' | 'done' | 'uploading';
// `selfie` desapareció a propósito: se subía a `verification.additional_document`,
// que el proveedor documenta como un segundo documento de identidad o un
// comprobante de domicilio, NO como prueba de vida. Ese hueco ahora se usa para
// lo que realmente es.
type CaptureSide = 'front' | 'back' | 'address';

const STEP_ORDER: CaptureSide[] = ['front', 'back', 'address'];
/** Estados en los que ya no hay nada que subir. Espejo de ESTADOS_FINALES del endpoint. */
const FINALES: string[] = ['cerrada', 'bloqueada', 'completed'];

interface DocOpcion { tipo: string; nombre: string; nombreEn: string; reverso: boolean }

const COPY: Record<CaptureSide, { title: string; body: string; cta: string; icon: React.ReactElement }> = {
    front: {
        title: 'Frente de tu identificación',
        body: 'INE o pasaporte vigente. Busca buena luz y que se lean todos los datos.',
        cta: 'Tomar foto del frente',
        icon: (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2.5" fill="currentColor" fillOpacity="0.12" />
                <circle cx="8.5" cy="11" r="2.25" />
                <path d="M4.5 16c.6-1.8 2-2.8 4-2.8s3.4 1 4 2.8" />
                <line x1="14.5" y1="9.5" x2="19" y2="9.5" />
                <line x1="14.5" y1="12.5" x2="19" y2="12.5" />
            </svg>
        ),
    },
    back: {
        title: 'Reverso de tu identificación',
        body: 'Solo si es INE. Si es pasaporte, omite este paso.',
        cta: 'Tomar foto del reverso',
        icon: (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2.5" fill="currentColor" fillOpacity="0.12" />
                <line x1="5" y1="9" x2="19" y2="9" />
                <line x1="5" y1="12" x2="19" y2="12" />
                <line x1="5" y1="15" x2="13" y2="15" />
            </svg>
        ),
    },
    address: {
        title: 'Comprobante de domicilio',
        body: 'Sólo si te lo pedimos: un recibo de servicios o estado de cuenta reciente, a tu nombre. Puedes omitirlo.',
        cta: 'Tomar foto del comprobante',
        icon: (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 3h11l5 5v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="currentColor" fillOpacity="0.12" />
                <path d="M15 3v5h5" />
                <line x1="7" y1="13" x2="16" y2="13" />
                <line x1="7" y1="17" x2="13" y2="17" />
            </svg>
        ),
    },
};


// Textos de la isla, locales para no arrastrar el diccionario de ~373 KB al
// navegador. Esta pantalla la abre el dueño del negocio desde su teléfono, así
// que también deja de hablar de la INE: la identificación oficial se llama
// distinto en cada país.
const IC_STRINGS = {
  es: {
    enlaceInvalido: 'Enlace no válido',
    enlaceInvalidoDesc: 'Este enlace de verificación no existe. Regresa a tu computadora e inténtalo de nuevo desde Ajustes › Cobros.',
    enlaceExpirado: 'Este enlace ya expiró',
    enlaceExpiradoDesc: 'Por seguridad, los enlaces de verificación duran 10 minutos. Regresa a tu computadora y genera uno nuevo.',
    listo: 'Listo',
    listoDesc: 'Ya puedes regresar a tu computadora — la verificación sigue ahí automáticamente.',
    verificadoCord: 'Verificado con Cord',
    verificaIdentidad: 'Verifica tu identidad',
    necesitas: 'Vas a necesitar tu identificación oficial o pasaporte a la mano. Son pasos rápidos:',
    paso1: 'Foto del frente de tu identificación',
    paso2: 'Foto del reverso (si aplica)',
    paso3: 'Comprobante de domicilio, si te lo pedimos',
    comenzar: 'Comenzar',
    subiendo: 'Subiendo…',
    omitirPasaporte: 'Omitir — es un pasaporte',
    omitirPaso: 'Omitir este paso',
    elegirFoto: 'Elegir foto de la galería',
    queDocumento: '¿Qué documento vas a usar?',
    soloPasaporte: 'Como tu domicilio está en un país distinto al del negocio, solo se acepta pasaporte.',
  },
  en: {
    enlaceInvalido: 'Invalid link',
    enlaceInvalidoDesc: "This verification link doesn't exist. Go back to your computer and try again from Settings › Payments.",
    enlaceExpirado: 'This link expired',
    enlaceExpiradoDesc: 'For security, verification links last 10 minutes. Go back to your computer and generate a new one.',
    listo: 'Done',
    listoDesc: 'You can go back to your computer — the verification continues there automatically.',
    verificadoCord: 'Verified with Cord',
    verificaIdentidad: 'Verify your identity',
    necesitas: "You'll need your government ID or passport handy. Just a few quick steps:",
    paso1: 'Photo of the front of your ID',
    paso2: 'Photo of the back (if applicable)',
    paso3: 'Proof of address, if we ask for it',
    comenzar: 'Start',
    subiendo: 'Uploading…',
    omitirPasaporte: "Skip — it's a passport",
    omitirPaso: 'Skip this step',
    elegirFoto: 'Choose a photo instead',
    queDocumento: 'Which document will you use?',
    soloPasaporte: 'Because your address is in a different country from the business, only a passport is accepted.',
  },
} as const;

export default function IdentityCaptureMobile({ token, orgNombre, orgLogo, orgColor, locale = 'es' }: Props) {
    const S = IC_STRINGS[locale] ?? IC_STRINGS.es;
    const [step, setStep] = useState<Step>('loading');
    const [activeCapture, setActiveCapture] = useState<CaptureSide | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Qué documento va a traer la persona. Lo decide ANTES de abrir la cámara,
    // porque alimenta tres cosas de una vez: la forma del marco guía, si el paso
    // de reverso se salta solo, y qué se le pide en pantalla.
    const [documentos, setDocumentos] = useState<DocOpcion[]>([]);
    const [soloPasaporte, setSoloPasaporte] = useState(false);
    const [docElegido, setDocElegido] = useState<DocOpcion | null>(null);
    const [org, setOrg] = useState({ nombre: orgNombre || '', logoUrl: orgLogo || '', colorMarca: orgColor || '#0a192f' });

    useEffect(() => {
        fetch(`/api/billing/connect/capture/${token}`)
            .then((r) => r.json())
            .then((data) => {
                if (!data.ok) return setStep('notfound');
                if (data.org) setOrg(data.org);
                if (data.expired) return setStep('expired');
                setDocumentos(data.documentos || []);
                setSoloPasaporte(!!data.soloPasaporte);
                if (FINALES.includes(data.status)) return setStep('done');
                setStep('intro');
            })
            .catch(() => setStep('notfound'));
    }, [token]);

    const upload = async (side: CaptureSide, file: File, metricas?: Record<string, number> | null) => {
        setError(null);
        setStep('uploading');
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('part', side);
            // Las métricas de calidad viajan con la foto para quedar junto al
            // veredicto que después dé el proveedor. Es lo que permite calibrar
            // los umbrales con datos propios en vez de con una corazonada.
            if (metricas) fd.append('metricas', JSON.stringify(metricas));
            if (docElegido) fd.append('tipoDocumento', docElegido.tipo);
            const res = await fetch(`/api/billing/connect/capture/${token}`, { method: 'POST', body: fd });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'No se pudo subir la foto');
            // `min_cubierto` NO es "terminé": significa que ya llegó el frente y el
            // proveedor puede empezar, pero el reverso y el comprobante siguen
            // siendo subibles. Tratarlo como final es lo que dejaba el reverso
            // inalcanzable en siete de los ocho mercados.
            if (FINALES.includes(data.status)) {
                setStep('done');
                return;
            }
            const idx = STEP_ORDER.indexOf(side);
            let siguiente = STEP_ORDER[idx + 1];
            // El pasaporte no tiene reverso. Saltarlo automáticamente evita
            // pedirle a la persona que conozca la regla — antes había que pulsar
            // "es un pasaporte" a mano.
            if (siguiente === 'back' && docElegido && !docElegido.reverso) {
                siguiente = STEP_ORDER[idx + 2];
            }
            if (siguiente) setStep(siguiente);
            else void cerrarSesion();
        } catch (e: any) {
            setError(e.message || 'No se pudo subir la foto. Revisa tu conexión e inténtalo otra vez.');
            setStep(side);
        }
    };

    // Avisar al servidor que ya terminamos, para que el escritorio —que sondea
    // cada 2.5 s— lo vea de inmediato en vez de esperar a que expire el TTL.
    const cerrarSesion = async () => {
        try {
            const fd = new FormData();
            fd.append('action', 'cerrar');
            await fetch(`/api/billing/connect/capture/${token}`, { method: 'POST', body: fd });
        } catch { /* el TTL la cierra igual */ }
        setStep('done');
    };

    const skipBack = () => setStep('address');
    const omitirPaso = () => {
        const idx = STEP_ORDER.indexOf(step as CaptureSide);
        const siguiente = idx >= 0 ? STEP_ORDER[idx + 1] : null;
        if (siguiente) setStep(siguiente);
        else void cerrarSesion();
    };

    if (step === 'loading') {
        return (
            <div className="idcap-shell">
                <span className="idcap-spinner" aria-hidden="true"></span>
            </div>
        );
    }

    if (step === 'notfound') {
        return (
            <div className="idcap-shell">
                <div className="idcap-card idcap-center">
                    <h1>{S.enlaceInvalido}</h1>
                    <p>{S.enlaceInvalidoDesc}</p>
                </div>
            </div>
        );
    }

    if (step === 'expired') {
        return (
            <div className="idcap-shell">
                <div className="idcap-card idcap-center">
                    <h1>{S.enlaceExpirado}</h1>
                    <p>{S.enlaceExpiradoDesc}</p>
                </div>
            </div>
        );
    }

    if (step === 'done') {
        return (
            <div className="idcap-shell">
                <OrgBadge org={org} />
                <div className="idcap-card idcap-center">
                    <div className="idcap-check">
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                    </div>
                    <h1>{S.listo}</h1>
                    <p>{S.listoDesc}</p>
                </div>
                <span className="idcap-foot">{S.verificadoCord}</span>
            </div>
        );
    }

    if (step === 'intro') {
        return (
            <div className="idcap-shell">
                <OrgBadge org={org} />
                <div className="idcap-card">
                    <h1>{S.verificaIdentidad}</h1>
                    <p>{S.necesitas}</p>
                    <ul className="idcap-list">
                        <li>{S.paso1}</li>
                        <li>{S.paso2}</li>
                        <li>{S.paso3}</li>
                    </ul>
                    <button type="button" className="idcap-cta" onClick={() => setStep('front')}>{S.comenzar}</button>
                </div>
                <span className="idcap-foot">{S.verificadoCord}</span>
            </div>
        );
    }

    if (step === 'uploading') {
        return (
            <div className="idcap-shell">
                <span className="idcap-spinner" aria-hidden="true"></span>
                <span className="idcap-uploading-text">{S.subiendo}</span>
            </div>
        );
    }

    // front | back | address — pantalla de instrucciones + CTA que abre la cámara.
    const side = step as CaptureSide;
    const copy = COPY[side];
    const stepIndex = STEP_ORDER.indexOf(side);

    return (
        <div className="idcap-shell">
            <OrgBadge org={org} />
            <div className="idcap-dots">
                {STEP_ORDER.map((s, i) => (
                    <span key={s} className={`idcap-dot ${i < stepIndex ? 'idcap-dot-done' : ''} ${i === stepIndex ? 'idcap-dot-active' : ''}`}></span>
                ))}
            </div>
            <div className="idcap-card">
                <div className="idcap-icon">{copy.icon}</div>
                <h1>{copy.title}</h1>
                <p>{copy.body}</p>
                {error && <div className="idcap-error">{error}</div>}
                {/* El documento se elige ANTES de abrir la cámara. Sin esto el
                    marco no puede tener la forma correcta y el reverso no se
                    puede saltar solo. */}
                {side === 'front' && documentos.length > 0 && (
                    <div className="idcap-docs">
                        <span className="idcap-docs-label">{S.queDocumento}</span>
                        {soloPasaporte && <span className="idcap-docs-nota">{S.soloPasaporte}</span>}
                        {documentos.map((d) => (
                            <button
                                key={d.tipo}
                                type="button"
                                className={`idcap-doc ${docElegido?.tipo === d.tipo ? 'is-sel' : ''}`}
                                onClick={() => setDocElegido(d)}
                            >
                                {locale === 'en' ? d.nombreEn : d.nombre}
                            </button>
                        ))}
                    </div>
                )}
                <button
                    type="button"
                    className="idcap-cta"
                    disabled={side === 'front' && documentos.length > 0 && !docElegido}
                    onClick={() => setActiveCapture(side)}
                >{copy.cta}</button>
                {/* Carril de archivo SIEMPRE visible, no sólo tras un error de
                    permiso: en iOS la app de cámara nativa produce una foto mucho
                    mejor que cualquier getUserMedia, y si el usuario bloqueó el
                    permiso a nivel sitio, "Reintentar" no lo desbloquea. */}
                <label className="idcap-skip idcap-file">
                    {S.elegirFoto}
                    <input
                        type="file"
                        accept="image/jpeg,image/png"
                        capture="environment"
                        hidden
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (f) void upload(side, f);
                        }}
                    />
                </label>
                {side === 'back' && (
                    <button type="button" className="idcap-skip" onClick={skipBack}>{S.omitirPasaporte}</button>
                )}
                {/* El comprobante de domicilio sólo se pide a veces. El copy ya
                    prometía "puedes omitirlo" y no había manera de hacerlo: el
                    string existía sin botón. */}
                {side === 'address' && (
                    <button type="button" className="idcap-skip" onClick={omitirPaso}>{S.omitirPaso}</button>
                )}
            </div>
            <span className="idcap-foot">{S.verificadoCord}</span>

            {activeCapture && (
                <LiveCapture
                    locale={locale}
                    side={activeCapture}
                    tipoDocumento={docElegido?.tipo}
                    onCancel={() => setActiveCapture(null)}
                    onCapture={(file, metricas) => {
                        setActiveCapture(null);
                        upload(activeCapture, file, metricas);
                    }}
                />
            )}
        </div>
    );
}

function OrgBadge({ org }: { org: { nombre: string; logoUrl: string; colorMarca: string } }) {
    return (
        <div className="idcap-org">
            {org.logoUrl ? (
                <img src={org.logoUrl} alt={org.nombre} className="idcap-org-logo" />
            ) : (
                <span className="idcap-org-avatar" style={{ background: org.colorMarca }}>{(org.nombre || '?').charAt(0).toUpperCase()}</span>
            )}
            <span className="idcap-org-name">{org.nombre}</span>
        </div>
    );
}
