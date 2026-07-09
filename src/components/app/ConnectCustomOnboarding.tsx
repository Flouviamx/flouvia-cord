import React, { useState, useEffect, useRef } from 'react';
import { STRIPE_MX_STATES, STRIPE_COMPANY_STRUCTURES, STRIPE_MCC_B2B, translateRequirement } from '../../lib/stripe-catalogs';
import LiveCapture from './LiveCapture';

interface ConnectCustomOnboardingProps {
    org?: any;
}

const STEP_LABELS = [
    'Tipo de entidad',
    'Datos del negocio',
    'Dirección fiscal',
    'Identidad',
    'Dueños',
    'Verificación',
    'Cuenta bancaria',
    'Términos',
];

// Validación real de CLABE (dígito de control: pesos 3,7,1 sobre los primeros 17).
function clabeValida(clabe: string): boolean {
    if (!/^\d{18}$/.test(clabe)) return false;
    const pesos = [3, 7, 1];
    let suma = 0;
    for (let i = 0; i < 17; i++) {
        suma += (Number(clabe[i]) * pesos[i % 3]) % 10;
    }
    return (10 - (suma % 10)) % 10 === Number(clabe[17]);
}

export default function ConnectCustomOnboarding({ org }: ConnectCustomOnboardingProps) {
    const [step, setStep] = useState(0);
    const [booting, setBooting] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [requirements, setRequirements] = useState<any>(null);
    const [accountId, setAccountId] = useState<string | null>(null);
    const [chargesEnabled, setChargesEnabled] = useState(false);
    const [detailsSubmitted, setDetailsSubmitted] = useState(false);
    const [disabledReason, setDisabledReason] = useState<string | null>(null);
    const [bankInfo, setBankInfo] = useState<{ bank_name?: string; last4?: string } | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // State
    const [businessType, setBusinessType] = useState<'company' | 'individual' | ''>('');
    const [mcc, setMcc] = useState('');
    const [url, setUrl] = useState(org?.sitioWeb || '');
    const [phone, setPhone] = useState(org?.telefono || '');
    const [email, setEmail] = useState(org?.emailContacto || '');
    const [name, setName] = useState(org?.razonSocial || org?.nombre || '');
    const [taxId, setTaxId] = useState(org?.rfc || '');
    const [structure, setStructure] = useState('');
    const [address, setAddress] = useState({
        line1: org?.direccion || '',
        city: '',
        state: '',
        postal_code: org?.cpFiscal || ''
    });

    // Person (Representative)
    const [person, setPerson] = useState({
        first_name: '',
        last_name: '',
        dob_day: '',
        dob_month: '',
        dob_year: '',
        id_number: '',
        phone: '',
        email: '',
        address_line1: '',
        address_city: '',
        address_state: '',
        address_postal_code: '',
        title: 'Director',
        percent_ownership: 100
    });
    const [personId, setPersonId] = useState<string | null>(null);
    const [ownersProvided, setOwnersProvided] = useState(false);

    // Document
    const [docFront, setDocFront] = useState<File | null>(null);
    const [docBack, setDocBack] = useState<File | null>(null);
    const [captureSide, setCaptureSide] = useState<'front' | 'back' | 'selfie' | null>(null);
    const [previewFront, setPreviewFront] = useState<string | null>(null);
    const [previewBack, setPreviewBack] = useState<string | null>(null);

    // Bank
    const [clabe, setClabe] = useState(org?.bancoClabe || '');
    const [accountHolder, setAccountHolder] = useState(org?.bancoBeneficiario || org?.razonSocial || '');

    useEffect(() => {
        checkStatus(true).finally(() => setBooting(false));
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, []);

    // Mientras la cuenta está "en revisión" (datos enviados, cobros aún no activos)
    // se sondea el estado cada 6s — al activarse se recarga la página para que los
    // toggles de métodos de pago (server-rendered) se desbloqueen solos.
    useEffect(() => {
        const pending = step === 8 && detailsSubmitted && !chargesEnabled
            && (!requirements?.currently_due || requirements.currently_due.length === 0);
        if (pending && !pollRef.current) {
            pollRef.current = setInterval(async () => {
                const acc = await fetchStatus();
                if (acc?.charges_enabled) {
                    if (pollRef.current) clearInterval(pollRef.current);
                    pollRef.current = null;
                    window.location.reload();
                }
            }, 6000);
        }
        if (!pending && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, [step, detailsSubmitted, chargesEnabled, requirements]);

    const fetchStatus = async (): Promise<any | null> => {
        try {
            const res = await fetch('/api/billing/connect/status');
            const data = await res.json();
            if (data.ok && data.account) {
                setAccountId(data.account.id);
                setRequirements(data.account.requirements);
                setChargesEnabled(data.account.charges_enabled);
                setDetailsSubmitted(data.account.details_submitted);
                setDisabledReason(data.account.disabled_reason || null);
                if (data.account.business_type === 'company' || data.account.business_type === 'individual') {
                    setBusinessType(data.account.business_type);
                }
                if (data.account.person_id) setPersonId(data.account.person_id);
                if (data.account.external_accounts?.length) setBankInfo(data.account.external_accounts[0]);
                return data.account;
            }
        } catch (e) {
            console.error('Error fetching status', e);
        }
        return null;
    };

    const checkStatus = async (resume = false) => {
        const acc = await fetchStatus();
        if (!acc) return;
        if (acc.details_submitted) {
            setStep(8); // Completada o en revisión
        } else if (resume && acc.id) {
            // Reanudar donde se quedó: brincar al primer requisito pendiente en vez
            // de forzar al usuario a re-caminar todo el wizard desde cero.
            const due: string[] = acc.requirements?.currently_due || [];
            if (due.length) {
                const primerPaso = Math.min(...due.map((r) => translateRequirement(r).paso));
                setStep(Math.max(1, Math.min(7, primerPaso)));
            }
        }
    };

    const goBack = () => {
        setError(null);
        setStep((s) => {
            // Persona física salta el paso 4 (dueños beneficiarios) en ambos sentidos.
            if (s === 5 && businessType === 'individual') return 3;
            return Math.max(0, s - 1);
        });
    };

    const handleNext = async () => {
        setError(null);
        setLoading(true);
        try {
            if (step === 0) {
                if (!businessType) throw new Error('Selecciona un tipo de registro');
                const res = await fetch('/api/billing/connect/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ business_type: businessType })
                });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error);
                setAccountId(data.accountId);
                setRequirements(data.requirements);
                if (data.business_type === 'company' || data.business_type === 'individual') {
                    setBusinessType(data.business_type);
                }
                setStep(1);
            } else if (step === 1) {
                if (!name || !taxId || !mcc) throw new Error('Faltan datos obligatorios');
                const rfcRegex = /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/i;
                if (!rfcRegex.test(taxId)) throw new Error('El RFC no tiene un formato válido (12 o 13 caracteres, formato oficial)');

                const payload: any = {
                    business_profile: { mcc, url, support_phone: phone, support_email: email },
                };
                if (businessType === 'company') {
                    payload.company = { name, tax_id: taxId, phone, structure: structure || undefined };
                } else {
                    payload.individual = { first_name: name.split(' ')[0], last_name: name.split(' ').slice(1).join(' ') || '.', id_number: taxId, phone };
                }
                const res = await fetch('/api/billing/connect/account', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error);
                setRequirements(data.requirements);
                setStep(2);
            } else if (step === 2) {
                if (!address.line1 || !address.state || !address.postal_code) throw new Error('Completa la dirección fiscal');
                const payload: any = {};
                if (businessType === 'company') {
                    payload.company = { address };
                } else {
                    payload.individual = { address };
                }
                const res = await fetch('/api/billing/connect/account', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error);
                setRequirements(data.requirements);
                setStep(3); // Empresa Y persona física pasan por el paso 3 (datos personales + DOB)
            } else if (step === 3) { // Datos personales (representante o persona física)
                if (!person.first_name || !person.last_name || !person.id_number) throw new Error('Completa los datos personales');
                const d = Number(person.dob_day), m = Number(person.dob_month), y = Number(person.dob_year);
                if (!d || !m || !y || d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > new Date().getFullYear() - 18) {
                    throw new Error('Revisa la fecha de nacimiento (debes ser mayor de 18 años)');
                }
                const dob = { day: person.dob_day, month: person.dob_month, year: person.dob_year };
                const personAddress = {
                    line1: person.address_line1,
                    city: person.address_city,
                    state: person.address_state,
                    postal_code: person.address_postal_code,
                    country: 'MX'
                };
                if (businessType === 'individual') {
                    // Persona física: los datos van al individual[...] de la CUENTA (no una person aparte).
                    const res = await fetch('/api/billing/connect/account', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ individual: {
                            first_name: person.first_name,
                            last_name: person.last_name,
                            id_number: person.id_number,
                            email: person.email,
                            phone: person.phone,
                            dob,
                            address: personAddress,
                        } })
                    });
                    const data = await res.json();
                    if (!data.ok) throw new Error(data.error);
                    setRequirements(data.requirements);
                    setStep(5); // las personas físicas omiten el paso de dueños beneficiarios
                } else {
                    const payload = {
                        first_name: person.first_name,
                        last_name: person.last_name,
                        id_number: person.id_number,
                        email: person.email,
                        phone: person.phone,
                        dob,
                        address: personAddress,
                        relationship: { representative: true, owner: true, director: true, title: person.title, percent_ownership: person.percent_ownership }
                    };
                    // Si ya existe el representante (reanudación), se ACTUALIZA en vez
                    // de crear una segunda persona duplicada en la cuenta.
                    const res = await fetch('/api/billing/connect/persons', {
                        method: personId ? 'PATCH' : 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(personId ? { ...payload, id: personId } : payload)
                    });
                    const data = await res.json();
                    if (!data.ok) throw new Error(data.error);
                    if (data.personId) setPersonId(data.personId);
                    setRequirements(data.requirements);
                    setStep(4);
                }
            } else if (step === 4) { // Dueños Beneficiarios
                if (!ownersProvided) throw new Error('Confirma que la lista de dueños está completa para continuar');
                const res = await fetch('/api/billing/connect/account', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ company: { owners_provided: true, directors_provided: true, executives_provided: true } })
                });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error);
                setRequirements(data.requirements);
                setStep(5);
            } else if (step === 5) { // Identificación
                if (!docFront) throw new Error('Sube al menos el frente de tu identificación');
                if (businessType === 'company' && !personId) throw new Error('Primero completa los datos del representante (paso 4 del asistente)');

                const uploadDoc = async (file: File, side: string) => {
                    const fd = new FormData();
                    fd.append('file', file);
                    fd.append('side', side);
                    if (businessType === 'company') {
                        fd.append('personId', personId!);
                        fd.append('isCompanyDoc', 'false');
                    } else {
                        fd.append('isCompanyDoc', 'true');
                    }
                    const res = await fetch('/api/billing/connect/document', { method: 'POST', body: fd });
                    const data = await res.json();
                    if (!data.ok) throw new Error(data.error || 'Error al subir el documento');
                    return data;
                };

                await uploadDoc(docFront, 'front');
                if (docBack) await uploadDoc(docBack, 'back');

                await fetchStatus();
                setStep(6);
            } else if (step === 6) { // Cuenta Bancaria
                const cl = String(clabe).replace(/\D/g, '');
                if (cl.length !== 18) throw new Error('La CLABE debe tener 18 dígitos');
                if (!clabeValida(cl)) throw new Error('La CLABE no es válida — revisa que esté bien escrita (el dígito de control no coincide)');
                if (!accountHolder.trim()) throw new Error('Escribe el nombre del titular de la cuenta');
                const res = await fetch('/api/billing/connect/external-account', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clabe: cl, account_holder_name: accountHolder, account_holder_type: businessType })
                });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error);
                setRequirements(data.requirements);
                if (data.external_account?.last4) setBankInfo({ bank_name: data.external_account.bank_name, last4: data.external_account.last4 });
                setStep(7);
            } else if (step === 7) { // TOS Acceptance
                const res = await fetch('/api/billing/connect/account', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tos_acceptance: true })
                });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error);
                await fetchStatus();
                setStep(8);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const dueList: string[] = requirements?.currently_due || [];

    const renderRequirements = () => {
        if (!dueList.length) return null;
        return (
            <div className="co-requirements">
                <div className="co-req-header">Requisitos pendientes</div>
                <ul className="co-req-list">
                    {dueList.map((req: string) => {
                        const tr = translateRequirement(req);
                        return <li key={req} onClick={() => setStep(tr.paso)} className="co-req-item">
                            <span className="co-req-msg">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.1"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                                {tr.mensaje}
                            </span>
                            <span className="co-req-action">Completar →</span>
                        </li>;
                    })}
                </ul>
            </div>
        );
    };

    if (booting) {
        return (
            <div className="co-boot">
                <span className="co-spinner" aria-hidden="true"></span>
                <span>Consultando el estado de tu cuenta…</span>
            </div>
        );
    }

    if (step === 8) {
        if (chargesEnabled) {
            return (
                <div className="co-active">
                    {bankInfo?.last4 && (
                        <div className="co-bank-row">
                            <div className="co-bank-ico">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11" fill="currentColor" fillOpacity="0.1"/><path d="M9 21v-6h6v6"/></svg>
                            </div>
                            <div className="co-bank-text">
                                <strong>{bankInfo.bank_name || 'Cuenta bancaria'}</strong>
                                <span>CLABE terminación •••• {bankInfo.last4} — aquí llegan tus depósitos.</span>
                            </div>
                            <button type="button" className="co-btn co-btn-ghost" onClick={() => setStep(6)}>Cambiar</button>
                        </div>
                    )}
                    {!bankInfo?.last4 && (
                        <button type="button" className="co-btn co-btn-ghost" onClick={() => setStep(6)}>Editar cuenta bancaria (CLABE)</button>
                    )}
                </div>
            );
        }
        return (
            <div className="co-success">
                {renderRequirements()}
                {dueList.length === 0 ? (
                    <div className="co-review">
                        <span className="co-spinner co-spinner-lg" aria-hidden="true"></span>
                        <h3>Tus datos están en revisión</h3>
                        <p>
                            Stripe está verificando tu información — normalmente toma un par de minutos.
                            Esta página se actualizará sola en cuanto tus cobros estén activos.
                        </p>
                        {disabledReason && disabledReason !== 'requirements.pending_verification' && (
                            <p className="co-review-reason">Detalle de Stripe: {disabledReason}</p>
                        )}
                    </div>
                ) : null}
            </div>
        );
    }

    const totalSteps = STEP_LABELS.length;
    const progressPct = Math.round(((step + 1) / totalSteps) * 100);

    return (
        <div className="connect-custom-onboarding">
            <div className="co-header">
                <div className="co-header-text">
                    <h3>{STEP_LABELS[step]}</h3>
                    <span className="co-step-count">Paso {step + 1} de {totalSteps}</span>
                </div>
                {accountId && <span className="co-account-id">{accountId}</span>}
            </div>
            <div className="co-progress" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
                <span className="co-progress-fill" style={{ width: `${progressPct}%` }}></span>
            </div>

            {error && <div className="co-error" role="alert">{error}</div>}

            <div className="co-step-content" key={step}>
                {step === 0 && (
                    <div className="co-step">
                        <p className="co-sub">¿Cómo está registrado legalmente tu negocio ante el SAT?</p>
                        <div className="co-radio-list">
                            <label className={`co-card-radio ${businessType === 'company' ? 'active' : ''}`}>
                                <input type="radio" name="btype" checked={businessType === 'company'} onChange={() => setBusinessType('company')} />
                                <div className="cr-text">
                                    <strong>Persona Moral</strong>
                                    <span>Empresa, S.A. de C.V., S. de R.L., Asociación</span>
                                </div>
                            </label>
                            <label className={`co-card-radio ${businessType === 'individual' ? 'active' : ''}`}>
                                <input type="radio" name="btype" checked={businessType === 'individual'} onChange={() => setBusinessType('individual')} />
                                <div className="cr-text">
                                    <strong>Persona Física</strong>
                                    <span>Propietario único, RESICO, PFAE</span>
                                </div>
                            </label>
                        </div>
                    </div>
                )}

                {step === 1 && (
                    <div className="co-step">
                        <div className="s-field">
                            <label>{businessType === 'company' ? 'Razón Social' : 'Nombre Completo (Negocio)'}</label>
                            <input className="s-input" value={name} onChange={e => setName(e.target.value)} placeholder={businessType === 'company' ? 'Ej. Mi Empresa S.A. de C.V.' : 'Ej. Juan Pérez'} />
                        </div>
                        <div className="s-row">
                            <div className="s-field">
                                <label>RFC</label>
                                <input className="s-input" value={taxId} onChange={e => setTaxId(e.target.value.toUpperCase())} maxLength={13} autoCapitalize="characters" />
                                <span className="s-hint">Lo usamos para verificar tu identidad ante el SAT.</span>
                            </div>
                            <div className="s-field">
                                <label>Giro del negocio (MCC)</label>
                                <input className="s-input" list="mcc-list" value={mcc} onChange={e => setMcc(e.target.value)} placeholder="Busca tu giro..." />
                                <datalist id="mcc-list">
                                    {STRIPE_MCC_B2B.map(m => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
                                </datalist>
                                <span className="s-hint">Selecciona el código que más se acerque a tu actividad principal.</span>
                            </div>
                        </div>
                        {businessType === 'company' && (
                            <div className="s-field">
                                <label>Estructura Legal</label>
                                <select className="s-input" value={structure} onChange={e => setStructure(e.target.value)}>
                                    <option value="">Selecciona...</option>
                                    {STRIPE_COMPANY_STRUCTURES.map(s => <option key={s.codigo} value={s.codigo}>{s.nombre}</option>)}
                                </select>
                            </div>
                        )}
                        <div className="s-row">
                            <div className="s-field">
                                <label>Sitio web o Link social</label>
                                <input className="s-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" type="url" />
                            </div>
                            <div className="s-field">
                                <label>Teléfono de soporte</label>
                                <input className="s-input" value={phone} onChange={e => setPhone(e.target.value)} type="tel" />
                            </div>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="co-step">
                        <div className="s-field">
                            <label>Calle, número exterior e interior</label>
                            <input className="s-input" value={address.line1} onChange={e => setAddress({...address, line1: e.target.value})} />
                        </div>
                        <div className="s-row">
                            <div className="s-field">
                                <label>Código Postal</label>
                                <input className="s-input" value={address.postal_code} onChange={e => setAddress({...address, postal_code: e.target.value.replace(/\D/g, '')})} maxLength={5} inputMode="numeric" />
                            </div>
                            <div className="s-field">
                                <label>Ciudad / Municipio</label>
                                <input className="s-input" value={address.city} onChange={e => setAddress({...address, city: e.target.value})} />
                            </div>
                        </div>
                        <div className="s-field">
                            <label>Estado</label>
                            <select className="s-input" value={address.state} onChange={e => setAddress({...address, state: e.target.value})}>
                                <option value="">Selecciona estado...</option>
                                {STRIPE_MX_STATES.map(s => <option key={s.codigo} value={s.codigo}>{s.nombre}</option>)}
                            </select>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="co-step">
                        <p className="co-sub">{businessType === 'individual' ? 'Como persona física, necesitamos verificar tu identidad ante Stripe.' : 'Persona autorizada para operar la cuenta bancaria de la empresa.'}</p>
                        <div className="s-row">
                            <div className="s-field">
                                <label>Nombre(s)</label>
                                <input className="s-input" value={person.first_name} onChange={e => setPerson({...person, first_name: e.target.value})} autoComplete="given-name" />
                            </div>
                            <div className="s-field">
                                <label>Apellidos</label>
                                <input className="s-input" value={person.last_name} onChange={e => setPerson({...person, last_name: e.target.value})} autoComplete="family-name" />
                            </div>
                        </div>
                        <div className="s-row">
                            <div className="s-field">
                                <label>CURP o RFC personal</label>
                                <input className="s-input" value={person.id_number} onChange={e => setPerson({...person, id_number: e.target.value.toUpperCase()})} autoCapitalize="characters" />
                            </div>
                            <div className="s-field">
                                <label>Fecha de nacimiento</label>
                                <div className="co-dob">
                                    <input className="s-input" placeholder="DD" value={person.dob_day} onChange={e => setPerson({...person, dob_day: e.target.value.replace(/\D/g, '')})} maxLength={2} inputMode="numeric" aria-label="Día" />
                                    <span className="co-dob-sep">/</span>
                                    <input className="s-input" placeholder="MM" value={person.dob_month} onChange={e => setPerson({...person, dob_month: e.target.value.replace(/\D/g, '')})} maxLength={2} inputMode="numeric" aria-label="Mes" />
                                    <span className="co-dob-sep">/</span>
                                    <input className="s-input" placeholder="AAAA" value={person.dob_year} onChange={e => setPerson({...person, dob_year: e.target.value.replace(/\D/g, '')})} maxLength={4} inputMode="numeric" aria-label="Año" />
                                </div>
                            </div>
                        </div>
                        <div className="s-row">
                            <div className="s-field">
                                <label>Email personal</label>
                                <input className="s-input" value={person.email} onChange={e => setPerson({...person, email: e.target.value})} type="email" autoComplete="email" />
                            </div>
                            <div className="s-field">
                                <label>Teléfono</label>
                                <input className="s-input" value={person.phone} onChange={e => setPerson({...person, phone: e.target.value})} type="tel" autoComplete="tel" />
                            </div>
                        </div>
                        <div className="co-divider"></div>
                        <p className="co-sub co-sub-strong">{businessType === 'individual' ? 'Tu dirección personal' : 'Dirección personal del representante'}</p>
                        <div className="s-field">
                            <label>Calle y número</label>
                            <input className="s-input" value={person.address_line1} onChange={e => setPerson({...person, address_line1: e.target.value})} />
                        </div>
                        <div className="s-row s-row-3">
                            <div className="s-field">
                                <label>Ciudad</label>
                                <input className="s-input" value={person.address_city} onChange={e => setPerson({...person, address_city: e.target.value})} />
                            </div>
                            <div className="s-field">
                                <label>Estado</label>
                                <select className="s-input" value={person.address_state} onChange={e => setPerson({...person, address_state: e.target.value})}>
                                    <option value="">Selecciona...</option>
                                    {STRIPE_MX_STATES.map(s => <option key={s.codigo} value={s.codigo}>{s.nombre}</option>)}
                                </select>
                            </div>
                            <div className="s-field co-field-cp">
                                <label>CP</label>
                                <input className="s-input" value={person.address_postal_code} onChange={e => setPerson({...person, address_postal_code: e.target.value.replace(/\D/g, '')})} maxLength={5} inputMode="numeric" />
                            </div>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div className="co-step">
                        <p className="co-sub">Por regulaciones financieras, se debe declarar si hay dueños con más del 25% de participación.</p>
                        <label className="co-attest">
                            <span className="s-toggle">
                                <input type="checkbox" checked={ownersProvided} onChange={e => setOwnersProvided(e.target.checked)} />
                                <span className="s-toggle-track"><span className="s-toggle-thumb"></span></span>
                            </span>
                            <span className="co-attest-text">
                                <strong>Confirmo que he agregado a todos los dueños con ≥25%</strong>
                                <span>El representante que agregaste ya fue marcado como dueño y directivo. Activa esto para declarar que la lista está completa.</span>
                            </span>
                        </label>
                    </div>
                )}

                {step === 5 && (
                    <div className="co-step">
                        <p className="co-sub">Necesitamos una foto clara de una identificación oficial vigente (INE o Pasaporte).</p>

                        <div className="s-field">
                            <label>Frente de la identificación</label>
                            {previewFront ? (
                                <div className="co-doc-preview">
                                    <img src={previewFront} alt="Frente" />
                                    <span className="co-doc-ok">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                        Lista
                                    </span>
                                    <button type="button" className="co-btn co-btn-ghost co-btn-sm" onClick={() => { setDocFront(null); setPreviewFront(null); }}>Quitar</button>
                                </div>
                            ) : (
                                <div className="co-doc-actions">
                                    <button type="button" className="co-btn co-btn-primary" onClick={() => setCaptureSide('front')}>
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill="currentColor" fillOpacity="0.12"/><circle cx="12" cy="13" r="4"/></svg>
                                        Tomar foto
                                    </button>
                                    <label className="co-btn co-btn-ghost co-upload">
                                        Subir archivo
                                        <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => {
                                            const file = e.target.files?.[0];
                                            if (file) { setDocFront(file); setPreviewFront(file.type.startsWith('image/') ? URL.createObjectURL(file) : '/imgs/logo-cord-navy.png'); }
                                        }} />
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className="s-field">
                            <label>Reverso (solo INE, omite si es Pasaporte)</label>
                            {previewBack ? (
                                <div className="co-doc-preview">
                                    <img src={previewBack} alt="Reverso" />
                                    <span className="co-doc-ok">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                        Lista
                                    </span>
                                    <button type="button" className="co-btn co-btn-ghost co-btn-sm" onClick={() => { setDocBack(null); setPreviewBack(null); }}>Quitar</button>
                                </div>
                            ) : (
                                <div className="co-doc-actions">
                                    <button type="button" className="co-btn co-btn-primary" onClick={() => setCaptureSide('back')}>
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" fill="currentColor" fillOpacity="0.12"/><circle cx="12" cy="13" r="4"/></svg>
                                        Tomar foto
                                    </button>
                                    <label className="co-btn co-btn-ghost co-upload">
                                        Subir archivo
                                        <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => {
                                            const file = e.target.files?.[0];
                                            if (file) { setDocBack(file); setPreviewBack(file.type.startsWith('image/') ? URL.createObjectURL(file) : '/imgs/logo-cord-navy.png'); }
                                        }} />
                                    </label>
                                </div>
                            )}
                        </div>

                        {captureSide && (
                            <LiveCapture
                                side={captureSide}
                                onCancel={() => setCaptureSide(null)}
                                onCapture={(file) => {
                                    if (captureSide === 'front') {
                                        setDocFront(file);
                                        setPreviewFront(URL.createObjectURL(file));
                                    } else if (captureSide === 'back') {
                                        setDocBack(file);
                                        setPreviewBack(URL.createObjectURL(file));
                                    }
                                    setCaptureSide(null);
                                }}
                            />
                        )}
                    </div>
                )}

                {step === 6 && (
                    <div className="co-step">
                        <p className="co-sub">Ingresa la cuenta CLABE donde recibirás los cobros. Debe estar a nombre del negocio o representante.</p>
                        <div className="s-field">
                            <label>CLABE Interbancaria (18 dígitos)</label>
                            <input className="s-input co-clabe" value={clabe} onChange={e => setClabe(e.target.value.replace(/\D/g, ''))} maxLength={18} inputMode="numeric" placeholder="000 000 00000000000 0" />
                            {clabe.length === 18 && (
                                clabeValida(clabe)
                                    ? <span className="s-hint co-hint-ok">CLABE válida</span>
                                    : <span className="s-hint co-hint-bad">El dígito de control no coincide — revisa la CLABE</span>
                            )}
                        </div>
                        <div className="s-field">
                            <label>Nombre del Titular de la cuenta</label>
                            <input className="s-input" value={accountHolder} onChange={e => setAccountHolder(e.target.value)} />
                        </div>
                    </div>
                )}

                {step === 7 && (
                    <div className="co-step">
                        <div className="co-tos">
                            <p><strong>Stripe Connected Account Agreement</strong></p>
                            <p>Stripe procesa los pagos para este servicio. Al continuar, aceptas el <a href="https://stripe.com/mx/connect-account/legal" target="_blank" rel="noopener noreferrer">Acuerdo de Cuenta Conectada de Stripe</a>, que incluye los Términos de Servicio de Stripe.</p>
                            <p>Como condición para que Cord habilite los servicios de procesamiento de pagos a través de Stripe, aceptas proporcionar a Cord información precisa y completa sobre ti y tu negocio, y autorizas a Cord a compartirla junto con los datos de transacciones relacionados con tu uso de los servicios de procesamiento de pagos provistos por Stripe.</p>
                        </div>
                        <p className="co-tos-note">Al hacer clic en "Aceptar y finalizar", aceptas los términos legales de Stripe.</p>
                    </div>
                )}
            </div>

            <div className="co-footer">
                {step > 0 && <button type="button" className="co-btn co-btn-ghost" onClick={goBack} disabled={loading}>Atrás</button>}
                <div style={{ flex: 1 }}></div>
                <button type="button" className="co-btn co-btn-primary" onClick={handleNext} disabled={loading}>
                    {loading && <span className="co-spinner co-spinner-btn" aria-hidden="true"></span>}
                    {loading ? 'Guardando…' : step === 7 ? 'Aceptar y finalizar' : 'Continuar'}
                </button>
            </div>
        </div>
    );
}
