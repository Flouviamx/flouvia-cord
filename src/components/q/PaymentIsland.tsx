import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { payerError } from '../../lib/pay-errors';
import '../../styles/payment-island.css';

const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';
type PaymentMethod = 'card' | 'spei';
type SpeiInstructions = {
    clabe: string;
    bankName: string;
    beneficiary: string;
    reference: string;
    amountRemaining: number;
    currency: string;
    expiresAt: number | null;
};

function SuccessView({ token, color, subscription }: { token: string; color?: string; subscription?: boolean }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.7rem', padding: '1.6rem 0 0.6rem' }}>
            <svg viewBox="0 0 52 52" width="58" height="58" aria-hidden="true">
                <circle cx="26" cy="26" r="23" fill={color || '#0a192f'} fillOpacity="0.12" stroke={color || '#0a192f'} strokeWidth="1.5" />
                <polyline points="14,27 22,35 38,18" fill="none" stroke={color || '#0a192f'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <strong style={{ fontSize: '1.02rem', fontWeight: 600, color: '#050505', letterSpacing: '-0.01em' }}>
                {subscription ? 'Iguala activada' : 'Pago recibido'}
            </strong>
            <p style={{ fontSize: '0.84rem', color: '#6b7686', lineHeight: 1.55, margin: 0, maxWidth: '36ch' }}>
                {subscription
                    ? 'Tu primer cobro se procesó y el cargo se repetirá automáticamente cada mes con esta tarjeta. Puedes cancelar cuando quieras.'
                    : 'Tu pago se procesó correctamente. La confirmación puede tardar unos segundos en reflejarse en la cotización.'}
            </p>
            <a href={`/q/${token}?pagado=1`} style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0a192f', textDecoration: 'none', marginTop: '0.4rem' }}>
                Volver a la cotización →
            </a>
        </div>
    );
}

function MethodSelector({ method, onChange, acceptsCard, acceptsSpei, color }: {
    method: PaymentMethod | null;
    onChange: (method: PaymentMethod) => void;
    acceptsCard: boolean;
    acceptsSpei: boolean;
    color?: string;
}) {
    if (!(acceptsCard && acceptsSpei)) return null;
    return (
        <fieldset className="payi-methods" style={{ border: 0, padding: 0, margin: '0 0 20px' }}>
            <legend style={{ fontSize: '12.5px', fontWeight: 600, color: '#4a5567', marginBottom: '9px' }}>Método de pago</legend>
            <div className="payi-method-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '4px', background: '#f5f5f7', borderRadius: '14px' }}>
                {([['card', 'Tarjeta'], ['spei', 'SPEI']] as const).map(([value, label]) => {
                    const selected = method === value;
                    return (
                        <button
                            key={value}
                            className="payi-method-btn"
                            type="button"
                            aria-pressed={selected}
                            onClick={() => onChange(value)}
                            style={{
                                border: selected ? `1px solid ${color || '#0a192f'}` : '1px solid transparent',
                                background: selected ? '#ffffff' : 'transparent',
                                color: '#050505', borderRadius: '11px', padding: '11px 14px',
                                fontSize: '0.88rem', fontWeight: selected ? 650 : 500, cursor: 'pointer',
                                boxShadow: selected ? '0 2px 8px rgba(10,25,47,0.08)' : 'none',
                                transition: `transform 0.18s ${easing}, background-color 0.2s ease, border-color 0.2s ease`,
                            }}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>
        </fieldset>
    );
}

function SpeiView({ instructions, color, token, cobroId }: { instructions: SpeiInstructions; color?: string; token: string; cobroId: string }) {
    const [copied, setCopied] = useState<string | null>(null);
    const [emailState, setEmailState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
    const money = new Intl.NumberFormat('es-MX', { style: 'currency', currency: instructions.currency }).format(instructions.amountRemaining / 100);
    const expiry = instructions.expiresAt
        ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(instructions.expiresAt * 1000))
        : null;
    const copy = async (label: string, value: string) => {
        await navigator.clipboard.writeText(value);
        setCopied(label);
        window.setTimeout(() => setCopied(null), 1600);
    };
    const emailInstructions = async () => {
        setEmailState('sending');
        try {
            const response = await fetch(`/api/q/${token}/spei-email`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cobro_id: cobroId }),
            });
            if (!response.ok) throw new Error();
            setEmailState('sent');
        } catch { setEmailState('error'); }
    };
    const row = (label: string, value: string, copyable = false) => (
        <div className="payi-spei-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(92px, 0.7fr) minmax(0, 1.3fr)', gap: '14px', alignItems: 'center', padding: '13px 0', borderBottom: '1px solid rgba(10,25,47,0.08)' }}>
            <span style={{ color: '#667085', fontSize: '0.78rem' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', minWidth: 0 }}>
                <strong style={{ color: '#050505', fontSize: '0.86rem', fontWeight: 600, overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
                {copyable && (
                    <button className="payi-spei-copy" type="button" onClick={() => copy(label, value)} style={{ border: 0, background: 'transparent', color: color || '#0a192f', fontSize: '0.76rem', fontWeight: 650, cursor: 'pointer', padding: '5px 0', flexShrink: 0 }}>
                        {copied === label ? 'Copiado' : 'Copiar'}
                    </button>
                )}
            </div>
        </div>
    );
    return (
        <section className="payi-spei" aria-labelledby="spei-title">
            <h2 id="spei-title" style={{ fontSize: '1.02rem', letterSpacing: '-0.02em', margin: '0 0 5px', color: '#050505' }}>Instrucciones SPEI</h2>
            <p style={{ fontSize: '0.82rem', color: '#667085', lineHeight: 1.55, margin: '0 0 9px' }}>Transfiere el monto exacto y usa la referencia indicada. La confirmación es automática.</p>
            <div>
                {row('Monto', `${money} ${instructions.currency}`)}
                {row('CLABE', instructions.clabe, true)}
                {row('Banco', instructions.bankName)}
                {row('Beneficiario', instructions.beneficiary)}
                {row('Referencia', instructions.reference, true)}
                {expiry && row('Vigencia', expiry)}
            </div>
            <button
                className="payi-primary"
                type="button"
                onClick={() => window.print()}
                style={{ width: '100%', marginTop: '18px', background: color || '#0a192f', color: '#ffffff', border: 0, borderRadius: '999px', padding: '14px 20px', fontSize: '0.9rem', fontWeight: 650, cursor: 'pointer' }}
            >
                Imprimir o guardar PDF
            </button>
            <button className="payi-secondary" type="button" onClick={emailInstructions} disabled={emailState === 'sending' || emailState === 'sent'}
                style={{ width: '100%', marginTop: '9px', background: '#f5f5f7', color: '#0a192f', border: 0, borderRadius: '999px', padding: '13px 20px', fontSize: '0.86rem', fontWeight: 650, cursor: 'pointer' }}>
                {emailState === 'sending' ? 'Enviando…' : emailState === 'sent' ? 'Instrucciones enviadas' : 'Enviar a mi correo'}
            </button>
            {emailState === 'error' && <p role="alert" style={{ color: '#dc2626', fontSize: '0.78rem', margin: '9px 0 0' }}>No pudimos enviar el correo. Puedes imprimir o guardar estas instrucciones.</p>}
        </section>
    );
}

function CheckoutForm({ token, color, amountLabel, subscription, onSuccess }: { token: string; color?: string; amountLabel?: string; subscription?: boolean; onSuccess: () => void }) {
    const stripe = useStripe();
    const elements = useElements();
    const [ready, setReady] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stripe || !elements) return;

        setLoading(true);
        setError(null);

        const { error: submitError } = await elements.submit();
        if (submitError) {
            const safe = payerError(submitError);
            console.error(`[cord-pagos:${safe.reference}]`, submitError);
            setError(`${safe.message} Ref: ${safe.reference}`);
            setLoading(false);
            return;
        }

        // `redirect: 'if_required'` mantiene el flujo de tarjeta en esta pantalla.
        // SPEI se confirma por servidor y no entra a este componente.
        const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
            elements,
            redirect: 'if_required',
            confirmParams: {
                return_url: `${window.location.origin}/q/${token}?pagado=1`,
            },
        });

        if (confirmError) {
            const safe = payerError(confirmError);
            console.error(`[cord-pagos:${safe.reference}]`, confirmError);
            setError(`${safe.message} Ref: ${safe.reference}`);
        } else if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
            onSuccess();
        }
        setLoading(false);
    };

    return (
        <form className="payi-checkout-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <PaymentElement onReady={() => setReady(true)} options={{ layout: 'tabs' }} />
            {error && (
                <div role="alert" style={{ color: '#dc2626', fontSize: '0.82rem', lineHeight: 1.5, padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px' }}>
                    {error}
                </div>
            )}
            <button
                className="payi-primary"
                type="submit"
                disabled={!stripe || !ready || loading}
                style={{
                    background: color || '#0a192f', color: '#fff', border: 'none',
                    padding: '15px 20px', borderRadius: '999px', fontSize: '0.98rem',
                    fontWeight: 600, letterSpacing: '-0.01em',
                    cursor: loading ? 'default' : 'pointer',
                    opacity: (!stripe || !ready || loading) ? 0.65 : 1,
                    transition: `transform 0.18s ${easing}, opacity 0.2s ease, box-shadow 0.25s ease`,
                    boxShadow: '0 10px 24px -10px rgba(10,25,47,0.45)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
                }}
                onMouseDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.975)'; }}
                onMouseUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
            >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" fill="currentColor" fillOpacity="0.12" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                {loading ? 'Procesando…' : subscription ? (amountLabel ? `Autorizar ${amountLabel} / mes` : 'Autorizar cobro mensual') : amountLabel ? `Pagar ${amountLabel}` : 'Pagar ahora'}
            </button>
        </form>
    );
}

export default function PaymentIsland({ token, color, amountLabel, cobroId, subscription, acceptsCard = true, acceptsSpei = false, checkoutV2 = false }: { token: string; color?: string; amountLabel?: string; cobroId?: string; subscription?: boolean; acceptsCard?: boolean; acceptsSpei?: boolean; checkoutV2?: boolean }) {
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [stripePromise, setStripePromise] = useState<any>(null);
    const [instructions, setInstructions] = useState<SpeiInstructions | null>(null);
    const [instructionsCobroId, setInstructionsCobroId] = useState<string | null>(null);
    const [method, setMethod] = useState<PaymentMethod | null>(() => {
        if (subscription) return 'card';
        if (!checkoutV2) return null;
        if (acceptsCard && !acceptsSpei) return 'card';
        if (acceptsSpei && !acceptsCard) return 'spei';
        return null;
    });
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [paid, setPaid] = useState(false);
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        let alive = true;
        const initPayment = async () => {
            if (checkoutV2 && !subscription && !method) {
                setLoading(false);
                return;
            }
            setLoading(true);
            setError(null);
            setClientSecret(null);
            setStripePromise(null);
            setInstructions(null);
            setInstructionsCobroId(null);
            try {
                const endpoint = subscription ? 'subscription-intent' : 'payment-intent';
                const res = await fetch(`/api/q/${token}/${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...(cobroId ? { cobro_id: cobroId } : {}), ...(method ? { metodo: method } : {}) }),
                });
                const data = await res.json();
                if (!alive) return;

                if (data.alreadyPaid || data.alreadyActive) { setPaid(true); return; }
                if (!res.ok) throw new Error(data.error || 'Error al iniciar el pago');

                if (data.metodo === 'spei' && data.instructions) {
                    setInstructions(data.instructions);
                    setInstructionsCobroId(data.cobroId);
                } else {
                    setClientSecret(data.clientSecret);
                    setStripePromise(loadStripe(data.publishableKey, { stripeAccount: data.accountId, locale: 'es-419' as any }));
                }
            } catch (err: any) {
                if (alive) setError(err.message);
            } finally {
                if (alive) setLoading(false);
            }
        };
        initPayment();
        return () => { alive = false; };
    }, [token, retry, method, cobroId, subscription, checkoutV2]);

    if (paid) return <SuccessView token={token} color={color} subscription={subscription} />;

    const selector = checkoutV2 && !subscription ? (
        <MethodSelector method={method} onChange={setMethod} acceptsCard={acceptsCard} acceptsSpei={acceptsSpei} color={color} />
    ) : null;

    if (loading) {
        return (
            <div>
                {selector}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0.4rem 0' }} aria-label="Cargando pago seguro">
                {[52, 52, 44].map((h, i) => (
                    <div key={i} style={{ height: `${h}px`, borderRadius: i === 2 ? '999px' : '12px', background: 'linear-gradient(100deg, #f0f0f3 40%, #f8f8fa 50%, #f0f0f3 60%)', backgroundSize: '200% 100%', animation: 'payi-shimmer 1.4s ease infinite' }} />
                ))}
                <style>{`@keyframes payi-shimmer { to { background-position: -200% 0; } }`}</style>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div>
                {selector}
                <div style={{ textAlign: 'center', padding: '1.4rem 0 0.6rem' }}>
                <p style={{ color: '#dc2626', fontSize: '0.86rem', lineHeight: 1.55, margin: '0 0 1rem' }}>{error}</p>
                <button
                    className="payi-retry"
                    type="button"
                    onClick={() => setRetry(r => r + 1)}
                    style={{ background: 'transparent', border: '1px solid rgba(10,25,47,0.15)', color: '#0a192f', padding: '9px 22px', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                    Reintentar
                </button>
                </div>
            </div>
        );
    }

    if (checkoutV2 && !subscription && !method) {
        return (
            <div>
                {selector}
                <p style={{ margin: '2px 0 0', color: '#667085', fontSize: '0.82rem', lineHeight: 1.5 }}>Elige cómo quieres pagar para continuar.</p>
            </div>
        );
    }

    if (instructions && instructionsCobroId) return <div>{selector}<SpeiView instructions={instructions} color={color} token={token} cobroId={instructionsCobroId} /></div>;

    if (!clientSecret || !stripePromise) return null;

    // Appearance API — hereda el look Apple de la app: inputs gris #f5f5f7 sin
    // borde que revelan un anillo navy al foco, radios generosos, tipografía sistema.
    const appearance = {
        theme: 'stripe' as const,
        variables: {
            colorPrimary: color || '#0a192f',
            colorBackground: '#ffffff',
            colorText: '#050505',
            colorTextSecondary: '#6b7686',
            colorTextPlaceholder: '#aab2bf',
            colorDanger: '#dc2626',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
            fontSizeBase: '15px',
            borderRadius: '12px',
            spacingUnit: '4.5px',
        },
        rules: {
            '.Input': {
                backgroundColor: '#f5f5f7',
                border: '1px solid transparent',
                boxShadow: 'none',
                padding: '12px 14px',
                transition: `border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease`,
            },
            '.Input:focus': {
                backgroundColor: '#ffffff',
                border: `1px solid ${color || '#0a192f'}`,
                boxShadow: '0 0 0 3px rgba(10,25,47,0.08)',
                outline: 'none',
            },
            '.Input--invalid': {
                border: '1px solid #dc2626',
                boxShadow: 'none',
            },
            '.Label': {
                fontSize: '12.5px',
                fontWeight: '500',
                color: '#4a5567',
                marginBottom: '6px',
            },
            '.Tab': {
                backgroundColor: '#f5f5f7',
                border: '1px solid transparent',
                boxShadow: 'none',
                transition: `all 0.2s ${easing}`,
            },
            '.Tab:hover': { backgroundColor: '#eeeef1', color: '#050505' },
            '.Tab--selected': {
                backgroundColor: '#ffffff',
                border: `1px solid ${color || '#0a192f'}`,
                boxShadow: '0 1px 3px rgba(10,25,47,0.08)',
            },
            '.Error': { fontSize: '12.5px' },
        },
    };

    return (
        <div>
            {selector}
            <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
                <CheckoutForm token={token} color={color} amountLabel={amountLabel} subscription={subscription} onSuccess={() => setPaid(true)} />
            </Elements>
        </div>
    );
}
