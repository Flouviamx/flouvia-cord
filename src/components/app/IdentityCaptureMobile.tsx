import React, { useEffect, useState } from 'react';
import LiveCapture from './LiveCapture';

interface Props {
    token: string;
    orgNombre?: string;
    orgLogo?: string;
    orgColor?: string;
}

type Step = 'loading' | 'notfound' | 'expired' | 'intro' | 'front' | 'back' | 'selfie' | 'done' | 'uploading';
type CaptureSide = 'front' | 'back' | 'selfie';

const STEP_ORDER: CaptureSide[] = ['front', 'back', 'selfie'];

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
    selfie: {
        title: 'Una selfie para confirmar que eres tú',
        body: 'Última capa de seguridad. Mira de frente a la cámara, con buena luz.',
        cta: 'Tomar selfie',
        icon: (
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.1" />
                <circle cx="12" cy="10" r="3.4" />
                <path d="M6.2 18c1-2.7 3-4.1 5.8-4.1s4.8 1.4 5.8 4.1" />
            </svg>
        ),
    },
};

export default function IdentityCaptureMobile({ token, orgNombre, orgLogo, orgColor }: Props) {
    const [step, setStep] = useState<Step>('loading');
    const [activeCapture, setActiveCapture] = useState<CaptureSide | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [org, setOrg] = useState({ nombre: orgNombre || '', logoUrl: orgLogo || '', colorMarca: orgColor || '#0a192f' });

    useEffect(() => {
        fetch(`/api/billing/connect/capture/${token}`)
            .then((r) => r.json())
            .then((data) => {
                if (!data.ok) return setStep('notfound');
                if (data.org) setOrg(data.org);
                if (data.expired) return setStep('expired');
                if (data.status === 'completed') return setStep('done');
                setStep('intro');
            })
            .catch(() => setStep('notfound'));
    }, [token]);

    const upload = async (side: CaptureSide, file: File) => {
        setError(null);
        setStep('uploading');
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('part', side);
            const res = await fetch(`/api/billing/connect/capture/${token}`, { method: 'POST', body: fd });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'No se pudo subir la foto');
            if (data.status === 'completed') {
                setStep('done');
                return;
            }
            const idx = STEP_ORDER.indexOf(side);
            setStep(STEP_ORDER[idx + 1] || 'selfie');
        } catch (e: any) {
            setError(e.message || 'No se pudo subir la foto. Revisa tu conexión e inténtalo otra vez.');
            setStep(side);
        }
    };

    const skipBack = () => setStep('selfie');

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
                    <h1>Enlace no válido</h1>
                    <p>Este enlace de verificación no existe. Regresa a tu computadora e inténtalo de nuevo desde Ajustes &rsaquo; Cobros.</p>
                </div>
            </div>
        );
    }

    if (step === 'expired') {
        return (
            <div className="idcap-shell">
                <div className="idcap-card idcap-center">
                    <h1>Este enlace ya expiró</h1>
                    <p>Por seguridad, los enlaces de verificación duran 10 minutos. Regresa a tu computadora y genera uno nuevo.</p>
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
                    <h1>Listo</h1>
                    <p>Ya puedes regresar a tu computadora — la verificación sigue ahí automáticamente.</p>
                </div>
                <span className="idcap-foot">Verificado con Cord</span>
            </div>
        );
    }

    if (step === 'intro') {
        return (
            <div className="idcap-shell">
                <OrgBadge org={org} />
                <div className="idcap-card">
                    <h1>Verifica tu identidad</h1>
                    <p>Vas a necesitar tu INE o pasaporte a la mano. Son 3 pasos rápidos:</p>
                    <ul className="idcap-list">
                        <li>Foto del frente de tu identificación</li>
                        <li>Foto del reverso (si aplica)</li>
                        <li>Una selfie para confirmar que eres tú</li>
                    </ul>
                    <button type="button" className="idcap-cta" onClick={() => setStep('front')}>Comenzar</button>
                </div>
                <span className="idcap-foot">Verificado con Cord</span>
            </div>
        );
    }

    if (step === 'uploading') {
        return (
            <div className="idcap-shell">
                <span className="idcap-spinner" aria-hidden="true"></span>
                <span className="idcap-uploading-text">Subiendo…</span>
            </div>
        );
    }

    // front | back | selfie — pantalla de instrucciones + CTA que abre la cámara.
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
                <button type="button" className="idcap-cta" onClick={() => setActiveCapture(side)}>{copy.cta}</button>
                {side === 'back' && (
                    <button type="button" className="idcap-skip" onClick={skipBack}>Omitir — es un pasaporte</button>
                )}
            </div>
            <span className="idcap-foot">Verificado con Cord</span>

            {activeCapture && (
                <LiveCapture
                    side={activeCapture}
                    onCancel={() => setActiveCapture(null)}
                    onCapture={(file) => {
                        setActiveCapture(null);
                        upload(activeCapture, file);
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
