import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

function CheckoutForm({ token, color, onSuccess }: { token: string; color?: string; onSuccess: () => void }) {
    const stripe = useStripe();
    const elements = useElements();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stripe || !elements) return;

        setLoading(true);
        setError(null);

        const { error: submitError } = await elements.submit();
        if (submitError) {
            setError(submitError.message || 'Error en los datos de pago');
            setLoading(false);
            return;
        }

        const { error: confirmError } = await stripe.confirmPayment({
            elements,
            confirmParams: {
                return_url: `${window.location.origin}/q/${token}?pagado=1`,
            },
        });

        if (confirmError) {
            setError(confirmError.message || 'El pago fue declinado');
        } else {
            // El return_url maneja la redirección exitosa, pero si es asíncrono
            onSuccess();
        }
        setLoading(false);
    };

    return (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <PaymentElement />
            {error && (
                <div style={{ color: '#ef4444', fontSize: '0.85rem', padding: '10px', background: '#fee2e2', borderRadius: '8px' }}>
                    {error}
                </div>
            )}
            <button 
                type="submit" 
                disabled={!stripe || loading}
                style={{ 
                    background: color || '#0f172a', color: '#fff', border: 'none', 
                    padding: '14px', borderRadius: '8px', fontSize: '1rem', 
                    fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1
                }}
            >
                {loading ? 'Procesando...' : 'Pagar ahora'}
            </button>
        </form>
    );
}

export default function PaymentIsland({ token, color }: { token: string; color?: string }) {
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [stripePromise, setStripePromise] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initPayment = async () => {
            try {
                const res = await fetch(`/api/q/${token}/payment-intent`, { method: 'POST' });
                const data = await res.json();
                
                if (!res.ok) throw new Error(data.error || 'Error al iniciar pago');
                
                setClientSecret(data.clientSecret);
                // Cargar stripe con la cuenta conectada
                setStripePromise(loadStripe(data.publishableKey, { stripeAccount: data.accountId }));
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        initPayment();
    }, [token]);

    if (loading) return <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Cargando pago seguro...</div>;
    if (error) return <div style={{ color: '#ef4444', textAlign: 'center', padding: '2rem' }}>{error}</div>;
    if (!clientSecret || !stripePromise) return null;

    return (
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <Elements stripe={stripePromise} options={{ 
                clientSecret, 
                appearance: { 
                    theme: 'stripe',
                    variables: { colorPrimary: color || '#0f172a' }
                } 
            }}>
                <CheckoutForm token={token} color={color} onSuccess={() => {}} />
            </Elements>
            <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '14px', height: '14px' }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                Pagos seguros procesados por Stripe
            </div>
        </div>
    );
}
