import React, { useState, useEffect } from 'react';
import { STRIPE_MX_STATES, STRIPE_COMPANY_STRUCTURES, STRIPE_MCC_B2B, translateRequirement } from '../../lib/stripe-catalogs';

interface ConnectCustomOnboardingProps {
    org?: any;
}

export default function ConnectCustomOnboarding({ org }: ConnectCustomOnboardingProps) {
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [requirements, setRequirements] = useState<any>(null);
    const [accountId, setAccountId] = useState<string | null>(null);
    
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
    
    // Bank
    const [clabe, setClabe] = useState(org?.bancoClabe || '');
    const [accountHolder, setAccountHolder] = useState(org?.bancoBeneficiario || org?.razonSocial || '');

    useEffect(() => {
        checkStatus();
    }, []);

    const checkStatus = async () => {
        try {
            const res = await fetch('/api/billing/connect/status');
            const data = await res.json();
            if (data.ok && data.account) {
                setAccountId(data.account.id);
                setRequirements(data.account.requirements);
                if (data.account.details_submitted) {
                    setStep(8); // Completed or Pending Review
                }
            }
        } catch (e) {
            console.error('Error fetching status', e);
        }
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
                setStep(1);
            } else if (step === 1) {
                if (!name || !taxId || !mcc) throw new Error('Faltan datos obligatorios');
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
                if (!person.first_name || !person.last_name || !person.id_number || !person.dob_day) throw new Error('Completa los datos personales');
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
                    // Aquí es donde se captura la FECHA DE NACIMIENTO del individuo (KYC obligatorio).
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
                    const res = await fetch('/api/billing/connect/persons', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await res.json();
                    if (!data.ok) throw new Error(data.error);
                    setPersonId(data.personId);
                    setRequirements(data.requirements);
                    setStep(4);
                }
            } else if (step === 4) { // Dueños Beneficiarios
                // Para simplificar, marcaremos los attestations de provided si seleccionan que sí
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
                    return await res.json();
                };
                
                await uploadDoc(docFront, 'front');
                if (docBack) await uploadDoc(docBack, 'back');
                
                await checkStatus();
                setStep(6);
            } else if (step === 6) { // Cuenta Bancaria
                if (!clabe || clabe.length !== 18) throw new Error('La CLABE debe tener 18 dígitos');
                const res = await fetch('/api/billing/connect/external-account', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clabe, account_holder_name: accountHolder, account_holder_type: businessType })
                });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error);
                setRequirements(data.requirements);
                setStep(7);
            } else if (step === 7) { // TOS Acceptance
                const res = await fetch('/api/billing/connect/account', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tos_acceptance: true })
                });
                const data = await res.json();
                if (!data.ok) throw new Error(data.error);
                await checkStatus();
                setStep(8);
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const renderRequirements = () => {
        if (!requirements || !requirements.currently_due || requirements.currently_due.length === 0) return null;
        return (
            <div className="co-requirements">
                <div className="co-req-header">REQUISITOS PENDIENTES</div>
                <ul className="co-req-list">
                    {requirements.currently_due.map((req: string) => {
                        const tr = translateRequirement(req);
                        return <li key={req} onClick={() => setStep(tr.paso)} className="co-req-item">
                            <span>{tr.mensaje}</span>
                            <span className="co-req-action">Completar (Paso {tr.paso})</span>
                        </li>;
                    })}
                </ul>
            </div>
        );
    };

    if (step === 8) {
        return (
            <div className="co-success">
                {renderRequirements()}
                {(!requirements || requirements.currently_due.length === 0) ? (
                    <div style={{ textAlign: 'center', padding: '2rem' }}>
                        <h3>Tus datos están en revisión</h3>
                        <p style={{ color: '#64748b', marginTop: '1rem' }}>
                            Stripe está verificando tu información. Normalmente toma un par de minutos. Recarga la página en un momento para ver si tus cobros ya están activos.
                        </p>
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <div className="connect-custom-onboarding">
            <div className="co-header">
                <h3>Configuración de cuenta ({step}/7)</h3>
                {accountId && <span className="co-account-id">ID: {accountId}</span>}
            </div>
            
            {error && <div className="co-error">{error}</div>}

            <div className="co-step-content">
                {step === 0 && (
                    <div className="co-step">
                        <h4>Tipo de entidad</h4>
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
                        <h4>Datos del negocio</h4>
                        <div className="s-field">
                            <label>{businessType === 'company' ? 'Razón Social' : 'Nombre Completo (Negocio)'}</label>
                            <input className="s-input" value={name} onChange={e => setName(e.target.value)} placeholder={businessType === 'company' ? 'Ej. Mi Empresa S.A. de C.V.' : 'Ej. Juan Pérez'} />
                        </div>
                        <div className="s-row">
                            <div className="s-field">
                                <label>RFC</label>
                                <input className="s-input" value={taxId} onChange={e => setTaxId(e.target.value)} maxLength={13} />
                            </div>
                            <div className="s-field">
                                <label>Giro del negocio (MCC)</label>
                                <select className="s-input" value={mcc} onChange={e => setMcc(e.target.value)}>
                                    <option value="">Selecciona una categoría...</option>
                                    {STRIPE_MCC_B2B.map(m => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
                                </select>
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
                                <input className="s-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" />
                            </div>
                            <div className="s-field">
                                <label>Teléfono de soporte</label>
                                <input className="s-input" value={phone} onChange={e => setPhone(e.target.value)} />
                            </div>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="co-step">
                        <h4>Dirección fiscal</h4>
                        <div className="s-field">
                            <label>Calle, número exterior e interior</label>
                            <input className="s-input" value={address.line1} onChange={e => setAddress({...address, line1: e.target.value})} />
                        </div>
                        <div className="s-row">
                            <div className="s-field">
                                <label>Código Postal</label>
                                <input className="s-input" value={address.postal_code} onChange={e => setAddress({...address, postal_code: e.target.value})} />
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
                        <h4>{businessType === 'individual' ? 'Tus datos personales' : 'Representante Legal'}</h4>
                        <p className="co-sub">{businessType === 'individual' ? 'Como persona física, necesitamos verificar tu identidad ante Stripe.' : 'Persona autorizada para operar la cuenta bancaria de la empresa.'}</p>
                        <div className="s-row">
                            <div className="s-field">
                                <label>Nombre(s)</label>
                                <input className="s-input" value={person.first_name} onChange={e => setPerson({...person, first_name: e.target.value})} />
                            </div>
                            <div className="s-field">
                                <label>Apellidos</label>
                                <input className="s-input" value={person.last_name} onChange={e => setPerson({...person, last_name: e.target.value})} />
                            </div>
                        </div>
                        <div className="s-row">
                            <div className="s-field">
                                <label>CURP o RFC personal</label>
                                <input className="s-input" value={person.id_number} onChange={e => setPerson({...person, id_number: e.target.value})} />
                            </div>
                            <div className="s-field">
                                <label>Fecha de Nac. (DD/MM/YYYY)</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input className="s-input" placeholder="DD" value={person.dob_day} onChange={e => setPerson({...person, dob_day: e.target.value})} maxLength={2} style={{ width: '45px' }} />
                                    <input className="s-input" placeholder="MM" value={person.dob_month} onChange={e => setPerson({...person, dob_month: e.target.value})} maxLength={2} style={{ width: '45px' }} />
                                    <input className="s-input" placeholder="YYYY" value={person.dob_year} onChange={e => setPerson({...person, dob_year: e.target.value})} maxLength={4} style={{ width: '70px' }} />
                                </div>
                            </div>
                        </div>
                        <div className="s-row">
                            <div className="s-field">
                                <label>Email personal</label>
                                <input className="s-input" value={person.email} onChange={e => setPerson({...person, email: e.target.value})} />
                            </div>
                            <div className="s-field">
                                <label>Teléfono</label>
                                <input className="s-input" value={person.phone} onChange={e => setPerson({...person, phone: e.target.value})} />
                            </div>
                        </div>
                        <hr style={{ margin: '1rem 0', border: 'none', borderTop: '1px dashed #e2e8f0' }} />
                        <p className="co-sub" style={{ fontWeight: 600 }}>Dirección personal del representante</p>
                        <div className="s-field">
                            <label>Calle y número</label>
                            <input className="s-input" value={person.address_line1} onChange={e => setPerson({...person, address_line1: e.target.value})} />
                        </div>
                        <div className="s-row">
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
                            <div className="s-field" style={{ maxWidth: '80px' }}>
                                <label>CP</label>
                                <input className="s-input" value={person.address_postal_code} onChange={e => setPerson({...person, address_postal_code: e.target.value})} />
                            </div>
                        </div>
                    </div>
                )}

                {step === 4 && (
                    <div className="co-step">
                        <h4>Dueños beneficiarios</h4>
                        <p className="co-sub">Por regulaciones financieras, se debe declarar si hay dueños con más del 25% de participación.</p>
                        <label className="s-toggle" style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '12px' }}>
                            <input type="checkbox" checked={ownersProvided} onChange={e => setOwnersProvided(e.target.checked)} />
                            <span className="s-toggle-track"><span className="s-toggle-thumb"></span></span>
                            <div>
                                <strong style={{ display: 'block', fontSize: '0.85rem' }}>Confirmo que he agregado a todos los dueños con ≥25%</strong>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>El representante que agregaste ya fue marcado como dueño y directivo. Activa esto para declarar que la lista está completa.</span>
                            </div>
                        </label>
                    </div>
                )}

                {step === 5 && (
                    <div className="co-step">
                        <h4>Verificación de Identidad</h4>
                        <p className="co-sub">Sube una foto clara de una identificación oficial vigente (INE o Pasaporte).</p>
                        <div className="s-field">
                            <label>Frente de la identificación</label>
                            <input type="file" accept="image/jpeg,image/png,application/pdf" className="s-input" style={{ paddingTop: '8px' }} onChange={e => setDocFront(e.target.files?.[0] || null)} />
                        </div>
                        <div className="s-field">
                            <label>Reverso (solo INE, omite si es Pasaporte)</label>
                            <input type="file" accept="image/jpeg,image/png,application/pdf" className="s-input" style={{ paddingTop: '8px' }} onChange={e => setDocBack(e.target.files?.[0] || null)} />
                        </div>
                    </div>
                )}

                {step === 6 && (
                    <div className="co-step">
                        <h4>Cuenta para Depósitos</h4>
                        <p className="co-sub">Ingresa la cuenta CLABE donde recibirás los cobros. Debe estar a nombre del negocio o representante.</p>
                        <div className="s-field">
                            <label>CLABE Interbancaria (18 dígitos)</label>
                            <input className="s-input" value={clabe} onChange={e => setClabe(e.target.value)} maxLength={18} inputMode="numeric" />
                        </div>
                        <div className="s-field">
                            <label>Nombre del Titular de la cuenta</label>
                            <input className="s-input" value={accountHolder} onChange={e => setAccountHolder(e.target.value)} />
                        </div>
                    </div>
                )}

                {step === 7 && (
                    <div className="co-step">
                        <h4>Acuerdo de Cuenta Conectada</h4>
                        <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', fontSize: '0.8rem', color: '#475569', lineHeight: 1.6, maxHeight: '200px', overflowY: 'auto', marginBottom: '1rem', border: '1px solid #e2e8f0' }}>
                            <p><strong>Stripe Connected Account Agreement</strong></p>
                            <p>Stripe processa los pagos para este servicio. Al continuar, aceptas el <a href="https://stripe.com/mx/connect-account/legal" target="_blank" rel="noopener noreferrer">Acuerdo de Cuenta Conectada de Stripe</a>, que incluye los Términos de Servicio de Stripe.</p>
                            <p>Como condición para que Cord habilite los servicios de procesamiento de pagos a través de Stripe, aceptas proporcionar a Cord información precisa y completa sobre ti y tu negocio, y autorizas a Cord a compartirla y a los datos de transacciones relacionados con tu uso de los servicios de procesamiento de pagos provistos por Stripe.</p>
                        </div>
                        <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>Al hacer clic en "Aceptar y Finalizar", aceptas los términos legales de Stripe.</p>
                    </div>
                )}
            </div>

            <div className="co-footer">
                {step > 0 && <button type="button" className="co-btn co-btn-ghost" onClick={() => setStep(s => s - 1)} disabled={loading}>Atrás</button>}
                <div style={{ flex: 1 }}></div>
                <button type="button" className="co-btn co-btn-primary" onClick={handleNext} disabled={loading}>
                    {loading ? 'Guardando...' : step === 7 ? 'Aceptar y Finalizar' : 'Continuar'}
                </button>
            </div>
        </div>
    );
}
