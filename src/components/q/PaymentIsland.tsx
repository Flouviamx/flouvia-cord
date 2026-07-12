import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const easing = 'cubic-bezier(0.16, 1, 0.3, 1)';

function SuccessView({ token, color }: { token: string; color?: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '0.7rem', padding: '1.6rem 0 0.6rem' }}>
            <svg viewBox="0 0 52 52" width="58" height="58" aria-hidden="true">
                <circle cx="26" cy="26" r="23" fill="none" stroke={color || '#0a192f'} strokeWidth="2" />
                <polyline points="14,27 22,35 38,18" fill="none" stroke={color || '#0a192f'} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <strong style={{ fontSize: '1.02rem', fontWeight: 600, color: '#050505', letterSpacing: '-0.01em' }}>Pago recibido</strong>
            <p style={{ fontSize: '0.84rem', color: '#6b7686', lineHeight: 1.55, margin: 0, maxWidth: '36ch' }}>
                Tu pago se procesó correctamente. La confirmación puede tardar unos segundos en reflejarse en la cotización.
            </p>
            <a href={`/q/${token}?pagado=1`} style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0a192f', textDecoration: 'none', marginTop: '0.4rem' }}>
                Volver a la cotización →
            </a>
        </div>
    );
}

function CheckoutForm({ token, color, amountLabel, onSuccess }: { token: string; color?: string; amountLabel?: string; onSuccess: () => void }) {
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
            setError(submitError.message || 'Revisa los datos de pago');
            setLoading(false);
            return;
        }

        // `redirect: 'if_required'` → tarjeta confirma AQUÍ mismo (sin recarga);
        // SPEI (customer_balance) sí redirige a la página de instrucciones de Stripe
        // con la CLABE, y de ahí regresa al return_url.
        const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
            elements,
            redirect: 'if_required',
            confirmParams: {
                return_url: `${window.location.origin}/q/${token}?pagado=1`,
            },
        });

        if (confirmError) {
            setError(confirmError.message || 'El pago fue declinado. Intenta con otro método.');
        } else if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
            onSuccess();
        }
        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <PaymentElement onReady={() => setReady(true)} options={{ layout: 'tabs' }} />
            {error && (
                <div role="alert" style={{ color: '#dc2626', fontSize: '0.82rem', lineHeight: 1.5, padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px' }}>
                    {error}
                </div>
            )}
            <button
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
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                {loading ? 'Procesando…' : amountLabel ? `Pagar ${amountLabel}` : 'Pagar ahora'}
            </button>
        </form>
    );
}

export default function PaymentIsland({ token, color, amountLabel, cobroId }: { token: string; color?: string; amountLabel?: string; cobroId?: string }) {
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [stripePromise, setStripePromise] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [paid, setPaid] = useState(false);
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        let alive = true;
        const initPayment = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/q/${token}/payment-intent`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(cobroId ? { cobro_id: cobroId } : {}),
                });
                const data = await res.json();
                if (!alive) return;

                if (data.alreadyPaid) { setPaid(true); return; }
                if (!res.ok) throw new Error(data.error || 'Error al iniciar el pago');

                setClientSecret(data.clientSecret);
                setStripePromise(loadStripe(data.publishableKey, { stripeAccount: data.accountId, locale: 'es-419' as any }));
            } catch (err: any) {
                if (alive) setError(err.message);
            } finally {
                if (alive) setLoading(false);
            }
        };
        initPayment();
        return () => { alive = false; };
    }, [token, retry]);

    if (paid) return <SuccessView token={token} color={color} />;

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0.4rem 0' }} aria-label="Cargando pago seguro">
                {[52, 52, 44].map((h, i) => (
                    <div key={i} style={{ height: `${h}px`, borderRadius: i === 2 ? '999px' : '12px', background: 'linear-gradient(100deg, #f0f0f3 40%, #f8f8fa 50%, #f0f0f3 60%)', backgroundSize: '200% 100%', animation: 'payi-shimmer 1.4s ease infinite' }} />
                ))}
                <style>{`@keyframes payi-shimmer { to { background-position: -200% 0; } }`}</style>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ textAlign: 'center', padding: '1.4rem 0 0.6rem' }}>
                <p style={{ color: '#dc2626', fontSize: '0.86rem', lineHeight: 1.55, margin: '0 0 1rem' }}>{error}</p>
                <button
                    type="button"
                    onClick={() => setRetry(r => r + 1)}
                    style={{ background: 'transparent', border: '1px solid rgba(10,25,47,0.15)', color: '#0a192f', padding: '9px 22px', borderRadius: '999px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
                >
                    Reintentar
                </button>
            </div>
        );
    }

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
            <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
                <CheckoutForm token={token} color={color} amountLabel={amountLabel} onSuccess={() => setPaid(true)} />
            </Elements>
        </div>
    );
}
