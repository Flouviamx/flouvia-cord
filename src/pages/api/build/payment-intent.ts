export const prerender = false;

import type { APIRoute } from 'astro';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql } from '../../../lib/db';
import { stripe } from '../../../lib/billing';
import { log } from '../../../lib/log';
import { limitPublicPayment } from '../../../lib/connect-security';

const PUB_KEY = import.meta.env.PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.PUBLIC_STRIPE_PUBLISHABLE_KEY;
const PAYMENTS_ENABLED = (import.meta.env.BUILD_AUCTION_LIVE || process.env.BUILD_AUCTION_LIVE) === 'true';
const AUCTION_ID = 'cord-flow-2026';
const MAX_LOGO_BYTES = 256 * 1024;

const logoSchema = z.string().max(360_000).superRefine((value, context) => {
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'Formato de logo no permitido.' });
        return;
    }
    const bytes = Buffer.from(match[2], 'base64');
    const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
    const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const webp = bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    const matchesMime = (match[1] === 'image/png' && png) || (match[1] === 'image/jpeg' && jpeg) || (match[1] === 'image/webp' && webp);
    if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES || !matchesMime) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: 'El logo no es una imagen válida o excede 256 KB.' });
    }
});

const websiteSchema = z.string().trim().url().max(500).refine((value) => {
    try {
        const url = new URL(value);
        return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
    } catch {
        return false;
    }
}, 'El sitio debe usar http o https.');

const inputSchema = z.object({
    positionId: z.string().regex(/^([0][1-9]|10)$/),
    requestId: z.string().uuid(),
    brandName: z.string().trim().min(2).max(80),
    contactEmail: z.string().trim().email().max(254),
    websiteUrl: websiteSchema,
    logoDataUrl: logoSchema,
    offerAmountCents: z.number().int().positive().max(50_000_000),
    acceptedTerms: z.literal(true),
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const GET: APIRoute = async () => {
    try {
        const [auction] = await sql`
            select id, status, starts_at, ends_at, hard_ends_at,
                   anti_snipe_minutes
              from build_auction where id = ${AUCTION_ID}`;
        if (!auction) return json({ error: 'La subasta todavía no está configurada.' }, 503);

        const rows = await sql`
            select position_id, tier, auction_status, starting_offer_cents,
                   min_increment_cents, bid_deposit_cents, current_offer_cents, current_brand_name,
                   current_logo_url, current_website_url, bid_count
              from build_positions order by position_id`;
        const history = await sql`
            select id, position_id, brand_name, offer_amount_cents, status,
                   confirmed_at, outbid_at, created_at
              from build_bids
             where status in ('leading','outbid_refunding','outbid','won')
             order by coalesce(confirmed_at, created_at) desc
             limit 100`;

        const positions = rows.map((row) => {
            const current = Number(row.current_offer_cents || 0);
            const starting = Number(row.starting_offer_cents);
            const increment = Number(row.min_increment_cents);
            return {
                id: row.position_id,
                tier: row.tier,
                status: row.auction_status,
                startingOfferCents: starting,
                currentOfferCents: current || null,
                nextOfferCents: current ? current + increment : starting,
                minIncrementCents: increment,
                bidDepositCents: Number(row.bid_deposit_cents),
                currentBrand: current ? String(row.current_brand_name || 'Marca verificada') : null,
                logoUrl: current ? String(row.current_logo_url || '') || null : null,
                websiteUrl: current ? String(row.current_website_url || '') || null : null,
                bidCount: Number(row.bid_count || 0),
            };
        });

        return json({
            auction: {
                id: auction.id,
                status: auction.status,
                startsAt: auction.starts_at,
                endsAt: auction.ends_at,
                hardEndsAt: auction.hard_ends_at,
                antiSnipeMinutes: Number(auction.anti_snipe_minutes),
            },
            positions,
            history: history.map((bid) => ({
                id: bid.id,
                positionId: bid.position_id,
                brandName: String(bid.brand_name || '').slice(0, 80) || 'Marca verificada',
                offerAmountCents: Number(bid.offer_amount_cents),
                status: bid.status,
                at: bid.confirmed_at || bid.created_at,
                outbidAt: bid.outbid_at,
            })),
            committedAmountCents: positions.reduce((sum, item) => sum + Number(item.currentOfferCents || 0), 0),
            paymentsEnabled: PAYMENTS_ENABLED,
        });
    } catch (error) {
        log.error('no se pudo leer la subasta de Cord Flow', { route: 'build-payment-intent', err: error });
        return json({ error: 'No pudimos consultar la subasta.' }, 503);
    }
};

export const POST: APIRoute = async ({ request }) => {
    // El código de cobro puede desplegarse antes que el cierre/operación legal.
    // Con una llave live configurada, fallar abierto sería aceptar dinero real.
    if (!PAYMENTS_ENABLED) return json({ error: 'La subasta está en vista previa; las garantías aún no están habilitadas.' }, 503);
    if (!PUB_KEY) return json({ error: 'Los pagos todavía no están configurados.' }, 503);

    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: 'Revisa los datos de tu oferta.' }, 400);
    const { positionId, requestId, brandName, contactEmail, offerAmountCents, websiteUrl, logoDataUrl } = parsed.data;
    const limited = await limitPublicPayment(request, 'build-bid', positionId, 6);
    if (limited) return limited;

    let bidId = '';
    try {
        // El requestId es la llave de idempotencia de extremo a extremo. Un
        // doble clic recupera el mismo PaymentIntent y nunca duplica depósitos.
        const [existing] = await sql`
            select id, position_id, stripe_payment_intent_id, deposit_amount_cents,
                   offer_amount_cents, status
              from build_bids where request_id = ${requestId}::uuid limit 1`;
        if (existing?.stripe_payment_intent_id && existing.status === 'pending') {
            const intent = await stripe(`/v1/payment_intents/${existing.stripe_payment_intent_id}`, undefined, 'GET');
            if (!intent?.client_secret) throw new Error('PaymentIntent recuperado sin client_secret');
            return json({
                clientSecret: intent.client_secret,
                publishableKey: PUB_KEY,
                positionId: existing.position_id,
                offerAmountCents: Number(existing.offer_amount_cents),
                depositAmountCents: Number(existing.deposit_amount_cents),
            });
        }
        if (existing) return json({ error: 'Esa solicitud ya fue procesada. Actualiza la subasta.' }, 409);

        const [row] = await sql`
            select p.position_id, p.tier, p.auction_status, p.starting_offer_cents,
                   p.min_increment_cents, p.bid_deposit_cents, p.current_offer_cents,
                   a.status as auction_status_global, a.ends_at
              from build_positions p cross join build_auction a
             where p.position_id = ${positionId} and a.id = ${AUCTION_ID}`;
        if (!row || row.auction_status !== 'open' || row.auction_status_global !== 'live' || new Date(row.ends_at).getTime() <= Date.now()) {
            return json({ error: 'La subasta para esta posición no está abierta.' }, 409);
        }
        const current = Number(row.current_offer_cents || 0);
        const minimum = current
            ? current + Number(row.min_increment_cents)
            : Number(row.starting_offer_cents);
        if (offerAmountCents < minimum) {
            return json({ error: `La oferta mínima cambió a $${Math.ceil(minimum / 100).toLocaleString('es-MX')} MXN.`, nextOfferCents: minimum }, 409);
        }

        // Garantía fija por posición: el servidor la deriva de inventario y no
        // permite que el cliente reduzca el monto ni lo ligamos al tamaño de la puja.
        const depositAmountCents = Number(row.bid_deposit_cents);
        bidId = randomUUID();
        const inserted = await sql`
            insert into build_bids (
              id, auction_id, position_id, request_id, brand_name, contact_email,
              website_url, logo_url, offer_amount_cents, deposit_amount_cents, terms_version, terms_accepted_at
            ) values (
              ${bidId}::uuid, ${AUCTION_ID}, ${positionId}, ${requestId}::uuid,
              ${brandName}, ${contactEmail.toLowerCase()}, ${websiteUrl}, ${logoDataUrl},
              ${offerAmountCents}, ${depositAmountCents}, 'cord-flow-2026-08-29-fixed-bond', now()
            ) on conflict (request_id) do nothing returning id`;
        if (!inserted.length) return json({ error: 'La solicitud ya está en proceso.' }, 409);

        try {
            const intent = await stripe('/v1/payment_intents', {
                amount: String(depositAmountCents),
                currency: 'mxn',
                description: `Cord Flow — garantía posición ${positionId}`,
                receipt_email: contactEmail.toLowerCase(),
                'payment_method_types[0]': 'card',
                'metadata[flow]': 'cord_build_bid',
                'metadata[auction_id]': AUCTION_ID,
                'metadata[bid_id]': bidId,
                'metadata[position_id]': positionId,
                'metadata[request_id]': requestId,
                'metadata[offer_amount_cents]': String(offerAmountCents),
                'metadata[deposit_model]': 'fixed_by_position',
                'metadata[deposit_amount_cents]': String(depositAmountCents),
            }, 'POST', { idempotencyKey: `cord-build-bid-${requestId}` });
            if (!intent?.id || !intent?.client_secret) throw new Error('Stripe creó un PaymentIntent incompleto');

            const linked = await sql`
                update build_bids set stripe_payment_intent_id = ${intent.id}, updated_at = now()
                 where id = ${bidId}::uuid and request_id = ${requestId}::uuid and status = 'pending'
                returning id`;
            if (!linked.length) {
                await stripe(`/v1/payment_intents/${intent.id}/cancel`, {}, 'POST', {
                    idempotencyKey: `cord-build-bid-cancel-${intent.id}`,
                }).catch(() => null);
                throw new Error('La oferta cambió antes de ligar el pago');
            }

            return json({
                clientSecret: intent.client_secret,
                publishableKey: PUB_KEY,
                positionId,
                offerAmountCents,
                depositAmountCents,
            });
        } catch (error) {
            await sql`update build_bids set status = 'failed', updated_at = now() where id = ${bidId}::uuid and status = 'pending'`;
            throw error;
        }
    } catch (error) {
        log.error('no se pudo preparar la garantía de Cord Flow', { route: 'build-payment-intent', positionId, bidId, err: error });
        return json({ error: 'No pudimos preparar la garantía. Intenta de nuevo en un momento.' }, 502);
    }
};
