// Read-only cutover audit. Never expires a session, changes a flag or moves money.
// node --env-file-if-exists=.env --env-file-if-exists=.env.local scripts/audit-legacy-checkout.mjs
import { neon } from '@neondatabase/serverless';
import { writeFile } from 'node:fs/promises';

async function audit() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!process.env.DATABASE_URL || !key) throw new Error('missing_configuration');
    const sql = neon(process.env.DATABASE_URL);
    // Operational read-only bootstrap audit, outside HTTP request/RLS lanes.
    const orgs = await sql`select id, stripe_account_id, checkout_v2 from orgs
        where sandbox_of is null and stripe_account_id is not null`;
    const groups = new Map();
    for (const o of orgs) {
        const ids = groups.get(o.stripe_account_id) || [];
        ids.push(o.id); groups.set(o.stripe_account_id, ids);
    }
    const report = { checkedAt: new Date().toISOString(), mode: key.includes('_live_') ? 'live' : 'test',
        scope: 'Configured database and its connected accounts; repeat immediately before cutover.',
        connectedAccounts: groups.size, organizationsUsingOldFlag: orgs.filter(o => !o.checkout_v2).length,
        scannedSessions: 0, legacySessions: 0, open: [], awaitingPayment: [], paidWithoutLocalConfirmation: [], incomplete: [] };
    for (const [account, orgIds] of groups) {
        for (const status of ['open', 'complete']) {
            let cursor;
            for (let page = 0; page < 20; page++) {
                const query = new URLSearchParams({ limit: '100', status });
                if (cursor) query.set('starting_after', cursor);
                const response = await fetch(`https://api.stripe.com/v1/checkout/sessions?${query}`, {
                    method: 'GET', headers: { Authorization: `Bearer ${key}`, 'Stripe-Account': account }, signal: AbortSignal.timeout(15000),
                });
                if (!response.ok) { report.incomplete.push({ account, status, reason: `provider_http_${response.status}` }); break; }
                const result = await response.json();
                if (!Array.isArray(result.data)) { report.incomplete.push({ account, status, reason: 'invalid_provider_response' }); break; }
                report.scannedSessions += result.data.length;
                for (const session of result.data) {
                    // The old Cord creator writes BOTH fields; do not emit tokens,
                    // checkout URLs, customer details or raw provider payloads.
                    const quoteId = session.metadata?.cotizacion_id;
                    if (session.mode !== 'payment' || !quoteId || !session.metadata?.token) continue;
                    report.legacySessions++;
                    const item = { account, sessionId: session.id, quoteId, paymentStatus: session.payment_status };
                    if (status === 'open') report.open.push(item);
                    else if (!['paid', 'no_payment_required'].includes(session.payment_status)) report.awaitingPayment.push(item);
                    else {
                        let confirmed = false;
                        for (const orgId of orgIds) {
                            const rows = await sql`select status from cotizaciones where org_id = ${orgId} and id::text = ${quoteId}`;
                            if (rows[0]?.status === 'paid') confirmed = true;
                        }
                        if (!confirmed) report.paidWithoutLocalConfirmation.push(item);
                    }
                }
                if (!result.has_more) break;
                cursor = result.data.at(-1)?.id;
                if (!cursor || page === 19) { report.incomplete.push({ account, status, reason: 'pagination_incomplete' }); break; }
            }
        }
    }
    report.readyAtAuditTime = report.open.length === 0 && report.awaitingPayment.length === 0
        && report.paidWithoutLocalConfirmation.length === 0 && report.incomplete.length === 0;
    return report;
}
try {
    const report = await audit();
    const output = process.argv.find(a => a.startsWith('--out='))?.slice(6);
    if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
    if (!report.readyAtAuditTime) process.exitCode = 2;
} catch {
    // Do not print errors from the DB/provider: they may contain credentials or PII.
    console.error('Legacy Checkout audit incomplete. Check connectivity, configured credentials and output-file availability. No changes were applied.');
    process.exitCode = 1;
}
