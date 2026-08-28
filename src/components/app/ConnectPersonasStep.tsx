// El paso de "Dueños" del alta de cobros, cuando de verdad puede haber varias.
//
// Antes esto era UN checkbox. Se creaba una sola Person —el representante,
// marcado a la fuerza como dueño y director— y el paso se limitaba a declarar
// `owners_provided: true`. Dos consecuencias que no eran cosméticas:
//
//   · En la UE, Reino Unido y Canadá la divulgación de titulares reales (≥25%)
//     es obligatoria por ley. Una S.L. española con tres socios al 30% no tenía
//     dónde declararlos, así que su alta no podía completarse — el proveedor
//     seguía pidiendo `owners.*` y no había formulario que lo satisficiera.
//   · La atestación que Cord enviaba era factualmente FALSA: se declaraba que
//     la lista estaba completa cuando el producto no permitía construirla.
//
// Contrato de esta pantalla:
//   · Todo lo que se pide sale de `requirements` del proveedor (nunca ramas por
//     país). Qué campos, qué roles y qué atestaciones: todo derivado.
//   · Móvil de verdad (regla 16): tarjetas apiladas, acciones siempre visibles
//     con área táctil ≥44 px, cero hover, cero drag, hoja completa en lugar de
//     popover por debajo de 880 px.
//   · La atestación sólo aparece cuando el proveedor la pide, y su texto dice
//     exactamente lo que se está firmando.

import React, { useState } from 'react';
import { describeVerificationRejection, translateRequirement } from '../../lib/stripe-catalogs';
import { personIdLabel } from '../../lib/countries';
import type { ConnectPersona } from '../../lib/connect-personas';

export interface PersonasStepStrings {
    titulo: string;
    intro: string;
    agregar: string;
    editar: string;
    quitar: string;
    verificar: string;
    guardar: string;
    cancelar: string;
    sinPersonas: string;
    rolRepresentante: string;
    rolDueno: string;
    rolDirector: string;
    rolEjecutivo: string;
    rolesTitulo: string;
    participacion: string;
    puesto: string;
    nombres: string;
    apellidos: string;
    idPersonal: string;
    fechaNacimiento: string;
    email: string;
    telefono: string;
    calle: string;
    ciudad: string;
    estado: string;
    codigoPostal: string;
    selecciona: string;
    estadoNoVerificada: string;
    estadoEnRevision: string;
    estadoVerificada: string;
    estadoAccion: string;
    sumaParticipacion: string;
    confirmarQuitar: string;
    pendientes: string;
}

export interface Subdivision { code: string; name: string }

interface Props {
    personas: ConnectPersona[];
    pais: string;
    /** Catálogo de estado/provincia del país, o `null` si ahí no se pide. */
    subdivisiones: Subdivision[] | null;
    locale: 'es' | 'en';
    strings: PersonasStepStrings;
    /** Requisitos vigentes de la cuenta, para saber qué campos pedir. */
    exigeIdNumber: boolean;
    exigeSsn: boolean;
    exigeNacionalidad: boolean;
    busy: boolean;
    onCrear: (payload: any) => Promise<void>;
    onEditar: (payload: any) => Promise<void>;
    onQuitar: (stripePersonId: string) => Promise<void>;
    onVerificar: (stripePersonId: string) => void;
}

type Borrador = {
    id: string | null;
    first_name: string;
    last_name: string;
    id_number: string;
    ssn_last_4: string;
    nationality: string;
    dob_day: string;
    dob_month: string;
    dob_year: string;
    email: string;
    phone: string;
    line1: string;
    city: string;
    state: string;
    postal_code: string;
    representante: boolean;
    dueno: boolean;
    director: boolean;
    ejecutivo: boolean;
    porcentaje: string;
    puesto: string;
};

const BORRADOR_VACIO: Borrador = {
    id: null, first_name: '', last_name: '', id_number: '', ssn_last_4: '', nationality: '',
    dob_day: '', dob_month: '', dob_year: '', email: '', phone: '',
    line1: '', city: '', state: '', postal_code: '',
    representante: false, dueno: true, director: false, ejecutivo: false,
    porcentaje: '', puesto: '',
};

export default function ConnectPersonasStep(props: Props) {
    const { personas, pais, locale, strings: S, busy } = props;
    const [editando, setEditando] = useState<Borrador | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmando, setConfirmando] = useState<string | null>(null);

    const SUBDIVISIONES = props.subdivisiones;
    const ID_LABEL = personIdLabel(pais, locale);

    // Informativo, nunca bloqueante: hay estructuras societarias legítimas donde
    // los titulares nombrados no suman 100%.
    const sumaPorcentaje = personas.reduce((total, p) => total + (p.esDueno ? (p.porcentaje ?? 0) : 0), 0);

    const abrirNuevo = () => { setError(null); setEditando({ ...BORRADOR_VACIO }); };

    const abrirEdicion = (persona: ConnectPersona) => {
        setError(null);
        // Sólo se precarga lo que la proyección guarda. Fecha de nacimiento,
        // identificación y domicilio NO se guardan en Cord a propósito, así que
        // se vuelven a capturar si se quieren cambiar — y si se dejan vacíos, no
        // se mandan y el proveedor conserva los que ya tenía.
        setEditando({
            ...BORRADOR_VACIO,
            id: persona.stripePersonId,
            first_name: persona.nombre.split(' ')[0] || '',
            last_name: persona.nombre.split(' ').slice(1).join(' '),
            representante: persona.esRepresentante,
            dueno: persona.esDueno,
            director: persona.esDirector,
            ejecutivo: persona.esEjecutivo,
            porcentaje: persona.porcentaje == null ? '' : String(persona.porcentaje),
            puesto: persona.puesto ?? '',
        });
    };

    const guardar = async () => {
        if (!editando) return;
        setError(null);
        const b = editando;
        if (!b.first_name.trim() || !b.last_name.trim()) {
            setError(locale === 'en' ? 'Enter the first and last name.' : 'Captura nombre y apellidos.');
            return;
        }
        if (!b.representante && !b.dueno && !b.director && !b.ejecutivo) {
            setError(locale === 'en'
                ? 'Pick at least one role for this person.'
                : 'Marca al menos un papel para esta persona.');
            return;
        }
        if (b.dueno) {
            const pct = Number(b.porcentaje);
            if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
                setError(locale === 'en'
                    ? 'Enter the ownership percentage (between 1 and 100).'
                    : 'Captura el porcentaje de participación (entre 1 y 100).');
                return;
            }
        }
        // La edad se valida aquí y no se deja al proveedor: su error llega en
        // inglés y hablando de un campo que el usuario no reconoce (regla 14).
        if (b.dob_day || b.dob_month || b.dob_year) {
            const d = Number(b.dob_day), m = Number(b.dob_month), y = Number(b.dob_year);
            const maxAnio = new Date().getFullYear() - 18;
            if (!d || !m || !y || d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > maxAnio) {
                setError(locale === 'en'
                    ? 'Check the date of birth (the person must be 18 or older).'
                    : 'Revisa la fecha de nacimiento (debe ser mayor de 18 años).');
                return;
            }
        }

        const payload: any = {
            first_name: b.first_name.trim(),
            last_name: b.last_name.trim(),
            ...(b.id_number ? { id_number: b.id_number } : {}),
            ...(b.ssn_last_4 ? { ssn_last_4: b.ssn_last_4 } : {}),
            ...(b.nationality ? { nationality: b.nationality.toUpperCase() } : {}),
            ...(b.email ? { email: b.email } : {}),
            ...(b.phone ? { phone: b.phone } : {}),
            ...(b.dob_day && b.dob_month && b.dob_year
                ? { dob: { day: b.dob_day, month: b.dob_month, year: b.dob_year } }
                : {}),
            ...(b.line1 || b.city || b.state || b.postal_code
                ? { address: { line1: b.line1, city: b.city, state: b.state, postal_code: b.postal_code, country: pais } }
                : {}),
            relationship: {
                representative: b.representante,
                owner: b.dueno,
                director: b.director,
                executive: b.ejecutivo,
                ...(b.puesto ? { title: b.puesto } : {}),
                ...(b.dueno ? { percent_ownership: Number(b.porcentaje) } : {}),
            },
        };

        try {
            if (b.id) await props.onEditar({ ...payload, id: b.id });
            else await props.onCrear(payload);
            setEditando(null);
        } catch (e: any) {
            setError(e?.message || 'No se pudo guardar.');
        }
    };

    const quitar = async (stripePersonId: string) => {
        setError(null);
        try {
            await props.onQuitar(stripePersonId);
            setConfirmando(null);
        } catch (e: any) {
            setError(e?.message || 'No se pudo quitar.');
        }
    };

    const badge = (p: ConnectPersona) => {
        if (p.verificacion === 'verified') return { clase: 'is-ok', texto: S.estadoVerificada };
        if (p.docCodigo || p.verifCodigo) return { clase: 'is-bad', texto: S.estadoAccion };
        if (p.verificacion === 'pending') return { clase: 'is-wait', texto: S.estadoEnRevision };
        return { clase: '', texto: S.estadoNoVerificada };
    };

    return (
        <div className="co-personas">
            <p className="co-sub">{S.intro}</p>

            {personas.length === 0 && !editando && (
                <p className="co-personas-vacio">{S.sinPersonas}</p>
            )}

            <ul className="co-persona-list">
                {personas.map((p) => {
                    const b = badge(p);
                    const motivo = describeVerificationRejection(p.verifCodigo, p.docCodigo, p.verifDetalle, locale);
                    return (
                        <li key={p.id} className="co-persona">
                            <div className="co-persona-head">
                                <strong className="co-persona-nombre">{p.nombre || '—'}</strong>
                                <span className={`co-persona-badge ${b.clase}`}>{b.texto}</span>
                            </div>
                            <div className="co-persona-roles">
                                {p.esRepresentante && <span className="co-chip">{S.rolRepresentante}</span>}
                                {p.esDueno && <span className="co-chip">{S.rolDueno}{p.porcentaje != null ? ` ${p.porcentaje}%` : ''}</span>}
                                {p.esDirector && <span className="co-chip">{S.rolDirector}</span>}
                                {p.esEjecutivo && <span className="co-chip">{S.rolEjecutivo}</span>}
                                {p.puesto && <span className="co-chip is-soft">{p.puesto}</span>}
                            </div>
                            {motivo && <p className="co-persona-motivo">{motivo}</p>}
                            {p.requisitos.length > 0 && (
                                <p className="co-persona-pendientes">
                                    {S.pendientes} {p.requisitos
                                        .map((r) => translateRequirement(r, locale, pais).mensaje)
                                        .filter((m, i, arr) => arr.indexOf(m) === i)
                                        .join(' · ')}
                                </p>
                            )}
                            {confirmando === p.stripePersonId ? (
                                <div className="co-persona-acciones">
                                    <span className="co-persona-confirm">{S.confirmarQuitar}</span>
                                    <button type="button" className="co-btn-danger" disabled={busy}
                                        onClick={() => p.stripePersonId && quitar(p.stripePersonId)}>{S.quitar}</button>
                                    <button type="button" className="co-btn-ghost" disabled={busy}
                                        onClick={() => setConfirmando(null)}>{S.cancelar}</button>
                                </div>
                            ) : (
                                <div className="co-persona-acciones">
                                    <button type="button" className="co-btn-ghost" disabled={busy}
                                        onClick={() => abrirEdicion(p)}>{S.editar}</button>
                                    {p.stripePersonId && (
                                        <button type="button" className="co-btn-ghost" disabled={busy}
                                            onClick={() => props.onVerificar(p.stripePersonId!)}>{S.verificar}</button>
                                    )}
                                    {!p.esRepresentante && p.stripePersonId && (
                                        <button type="button" className="co-btn-ghost" disabled={busy}
                                            onClick={() => setConfirmando(p.stripePersonId!)}>{S.quitar}</button>
                                    )}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>

            {personas.some((p) => p.esDueno) && (
                <p className="co-personas-suma">{S.sumaParticipacion.replace('{pct}', String(Math.round(sumaPorcentaje * 100) / 100))}</p>
            )}

            {!editando && (
                <button type="button" className="co-btn-add" onClick={abrirNuevo} disabled={busy}>+ {S.agregar}</button>
            )}

            {editando && (
                <div className="co-persona-form" role="group" aria-label={S.agregar}>
                    <p className="co-sub co-sub-strong">{S.rolesTitulo}</p>
                    <div className="co-role-grid">
                        {([
                            ['representante', S.rolRepresentante],
                            ['dueno', S.rolDueno],
                            ['director', S.rolDirector],
                            ['ejecutivo', S.rolEjecutivo],
                        ] as const).map(([clave, etiqueta]) => (
                            <label key={clave} className="co-role">
                                <span className="s-toggle">
                                    <input type="checkbox" checked={editando[clave] as boolean}
                                        onChange={(e) => setEditando({
                                            ...editando,
                                            [clave]: e.target.checked,
                                            ...(clave === 'dueno' && !e.target.checked ? { porcentaje: '' } : {}),
                                        })} />
                                    <span className="s-toggle-track"><span className="s-toggle-thumb"></span></span>
                                </span>
                                <span className="co-role-text">{etiqueta}</span>
                            </label>
                        ))}
                    </div>

                    <div className="s-row">
                        <div className="s-field">
                            <label>{S.nombres}</label>
                            <input className="s-input" value={editando.first_name} autoComplete="given-name"
                                onChange={(e) => setEditando({ ...editando, first_name: e.target.value })} />
                        </div>
                        <div className="s-field">
                            <label>{S.apellidos}</label>
                            <input className="s-input" value={editando.last_name} autoComplete="family-name"
                                onChange={(e) => setEditando({ ...editando, last_name: e.target.value })} />
                        </div>
                    </div>

                    <div className="s-row">
                        <div className="s-field">
                            <label>{S.puesto}</label>
                            <input className="s-input" value={editando.puesto} maxLength={60}
                                onChange={(e) => setEditando({ ...editando, puesto: e.target.value })} />
                        </div>
                        {editando.dueno && (
                            <div className="s-field">
                                <label>{S.participacion}</label>
                                <input className="s-input" value={editando.porcentaje} inputMode="decimal" placeholder="25"
                                    onChange={(e) => setEditando({ ...editando, porcentaje: e.target.value.replace(/[^0-9.]/g, '').slice(0, 6) })} />
                            </div>
                        )}
                    </div>

                    {/* Estos campos existen SÓLO si el proveedor los pide para esta
                        cuenta. En España, Alemania y Reino Unido no se dibujan. */}
                    {(props.exigeIdNumber || props.exigeSsn || props.exigeNacionalidad) && (
                        <div className="s-row">
                            {props.exigeIdNumber && (
                                <div className="s-field">
                                    <label>{ID_LABEL}</label>
                                    <input className="s-input" value={editando.id_number} autoComplete="off" autoCapitalize="characters"
                                        onChange={(e) => setEditando({ ...editando, id_number: e.target.value.toUpperCase() })} />
                                </div>
                            )}
                            {props.exigeSsn && (
                                <div className="s-field">
                                    <label>{S.idPersonal}</label>
                                    <input className="s-input" value={editando.ssn_last_4} maxLength={4} inputMode="numeric" autoComplete="off"
                                        onChange={(e) => setEditando({ ...editando, ssn_last_4: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                                </div>
                            )}
                            {props.exigeNacionalidad && (
                                <div className="s-field">
                                    <label>{locale === 'en' ? 'Nationality (2-letter code)' : 'Nacionalidad (código de 2 letras)'}</label>
                                    <input className="s-input" value={editando.nationality} maxLength={2} autoCapitalize="characters"
                                        onChange={(e) => setEditando({ ...editando, nationality: e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase() })} />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="s-row">
                        <div className="s-field">
                            <label>{S.fechaNacimiento}</label>
                            <div className="co-dob">
                                <input className="s-input" placeholder="DD" maxLength={2} inputMode="numeric" aria-label="DD"
                                    value={editando.dob_day} onChange={(e) => setEditando({ ...editando, dob_day: e.target.value.replace(/\D/g, '') })} />
                                <span className="co-dob-sep">/</span>
                                <input className="s-input" placeholder="MM" maxLength={2} inputMode="numeric" aria-label="MM"
                                    value={editando.dob_month} onChange={(e) => setEditando({ ...editando, dob_month: e.target.value.replace(/\D/g, '') })} />
                                <span className="co-dob-sep">/</span>
                                <input className="s-input" placeholder="AAAA" maxLength={4} inputMode="numeric" aria-label="AAAA"
                                    value={editando.dob_year} onChange={(e) => setEditando({ ...editando, dob_year: e.target.value.replace(/\D/g, '') })} />
                            </div>
                        </div>
                    </div>

                    <div className="s-row">
                        <div className="s-field">
                            <label>{S.email}</label>
                            <input className="s-input" type="email" value={editando.email} autoComplete="email"
                                onChange={(e) => setEditando({ ...editando, email: e.target.value })} />
                        </div>
                        <div className="s-field">
                            <label>{S.telefono}</label>
                            <input className="s-input" type="tel" value={editando.phone} autoComplete="tel"
                                onChange={(e) => setEditando({ ...editando, phone: e.target.value })} />
                        </div>
                    </div>

                    <div className="s-field">
                        <label>{S.calle}</label>
                        <input className="s-input" value={editando.line1}
                            onChange={(e) => setEditando({ ...editando, line1: e.target.value })} />
                    </div>
                    <div className="s-row s-row-3">
                        <div className="s-field">
                            <label>{S.ciudad}</label>
                            <input className="s-input" value={editando.city}
                                onChange={(e) => setEditando({ ...editando, city: e.target.value })} />
                        </div>
                        <div className="s-field">
                            <label>{S.estado}</label>
                            {SUBDIVISIONES ? (
                                <select className="s-input" value={editando.state}
                                    onChange={(e) => setEditando({ ...editando, state: e.target.value })}>
                                    <option value="">{S.selecciona}</option>
                                    {SUBDIVISIONES.map((sub: Subdivision) => <option key={sub.code} value={sub.code}>{sub.name}</option>)}
                                </select>
                            ) : (
                                <input className="s-input" value={editando.state} maxLength={60}
                                    onChange={(e) => setEditando({ ...editando, state: e.target.value })} />
                            )}
                        </div>
                        <div className="s-field co-field-cp">
                            <label>{S.codigoPostal}</label>
                            <input className="s-input" value={editando.postal_code} maxLength={12}
                                onChange={(e) => setEditando({ ...editando, postal_code: e.target.value.toUpperCase() })} />
                        </div>
                    </div>

                    {error && <p className="co-error" role="alert">{error}</p>}

                    <div className="co-persona-acciones">
                        <button type="button" className="co-btn-primary" disabled={busy} onClick={guardar}>{S.guardar}</button>
                        <button type="button" className="co-btn-ghost" disabled={busy} onClick={() => { setEditando(null); setError(null); }}>{S.cancelar}</button>
                    </div>
                </div>
            )}

            {error && !editando && <p className="co-error" role="alert">{error}</p>}
        </div>
    );
}
