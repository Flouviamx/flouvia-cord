import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sql: vi.fn(), stripe: vi.fn(), limit: vi.fn() }));
vi.mock('../src/lib/db', () => ({ sql: mocks.sql }));
vi.mock('../src/lib/billing', () => ({ stripe: mocks.stripe }));
vi.mock('../src/lib/log', () => ({ log: { error: vi.fn() } }));
vi.mock('../src/lib/connect-security', () => ({ limitPublicPayment: mocks.limit }));

const body = {
  positionId: '07', requestId: 'fa86b68c-ce81-4f72-9a57-42c14d0c27db', brandName: 'Test brand',
  contactEmail: 'example@example.com', websiteUrl: 'https://example.com',
  logoDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDXsAAAAASUVORK5CYII=',
  offerAmountCents: 750000, acceptedTerms: true,
};
const context = (data: unknown) => ({ request: new Request('http://localhost:4321/api/build/payment-intent', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
}) }) as any;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('BUILD_AUCTION_LIVE', 'false');
  vi.stubEnv('PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test_fixture');
  mocks.limit.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe('Build public auction', () => {
  it('keeps preview payments closed even if a caller bypasses the disabled button', async () => {
    const { POST } = await import('../src/pages/api/build/payment-intent');
    const result = await POST(context(body));
    expect(result.status).toBe(503);
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.stripe).not.toHaveBeenCalled();
  });

  it.each([
    { websiteUrl: 'javascript:alert(1)' },
    { websiteUrl: 'not-a-url' },
    { websiteUrl: 'https://user:password@example.com' },
    { logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
    { logoDataUrl: 'data:image/png;base64,aW52YWxpZA==' },
    { logoDataUrl: body.logoDataUrl.replace('image/png', 'image/jpeg') },
    { offerAmountCents: 1.5 },
    { acceptedTerms: false },
  ])('rejects unsafe or incomplete bid input before touching money: %j', async (change) => {
    vi.stubEnv('BUILD_AUCTION_LIVE', 'true');
    const { POST } = await import('../src/pages/api/build/payment-intent');
    const result = await POST(context({ ...body, ...change }));
    expect(result.status).toBe(400);
    expect(mocks.stripe).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('enforces the server minimum even when the UI is bypassed', async () => {
    vi.stubEnv('BUILD_AUCTION_LIVE', 'true');
    mocks.sql.mockResolvedValueOnce([]).mockResolvedValueOnce([{
      position_id: '07', auction_status: 'open', auction_status_global: 'live',
      ends_at: new Date(Date.now() + 3600000), current_offer_cents: 750000,
      min_increment_cents: 50000, starting_offer_cents: 750000, bid_deposit_cents: 100000,
    }]);
    const { POST } = await import('../src/pages/api/build/payment-intent');
    const result = await POST(context({ ...body, depositAmountCents: 1 }));
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({ nextOfferCents: 800000 });
    expect(mocks.stripe).not.toHaveBeenCalled();
  });

  it('does not expose DB details or invent empty success when the feed fails', async () => {
    mocks.sql.mockRejectedValue(new Error('database secret internal details'));
    const { GET } = await import('../src/pages/api/build/payment-intent');
    const response = await GET({} as any);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).not.toContain('secret');
  });
});
