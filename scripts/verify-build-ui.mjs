import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Isolated, anonymous browser. Never submits a payment or writes auction data.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const output = await mkdtemp(join(tmpdir(), 'cord-build-ui-'));
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', locale: 'es-MX' });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const origin = process.env.BUILD_TEST_ORIGIN || 'http://localhost:4321';
try {
  const response = await page.request.get(`${origin}/api/build/payment-intent`);
  assert.equal(response.status(), 200);
  const snapshot = await response.json();
  assert.equal(snapshot.positions.length, 10);
  assert.equal(snapshot.paymentsEnabled, false, 'This smoke test must not run against an open-money auction');
  await page.goto(`${origin}/build`, { waitUntil: 'networkidle' });
  const cookieChoice = page.getByRole('button', { name: 'Solo necesarias', exact: true });
  if (await cookieChoice.isVisible()) await cookieChoice.click();
  await page.locator('.ledger-row').first().waitFor();
  assert.equal(await page.locator('.ledger-row').count(), 10);
  assert.equal(await page.locator('.founder-bento article').count(), 3);
  assert.equal(await page.locator('.flow-preview-step').count(), 0);
  const geometry = await page.locator('.cord-flow').boundingBox();
  assert.ok(Math.abs(geometry.x) <= 2 && Math.abs(geometry.width - 1440) <= 2, JSON.stringify(geometry));
  await page.screenshot({ path: join(output, 'desktop.png'), fullPage: true });
  await page.locator('.founder-bento').screenshot({ path: join(output, 'edition-desktop.png') });
  await page.locator('.cord-flow').screenshot({ path: join(output, 'cords-desktop.png') });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('.cord-flow').scrollIntoViewIfNeeded();
  const windBox = await page.locator('.cord-flow').boundingBox();
  await page.mouse.move(windBox.x + 30, windBox.y + 125);
  await page.mouse.move(windBox.x + 1300, windBox.y + 130, { steps: 20 });
  const wind = await page.locator('.cord-mark-anchor').evaluateAll((marks) => marks.map((mark) => parseFloat(mark.style.getPropertyValue('--item-wind'))));
  assert.ok(wind.some((angle) => Math.abs(angle) > .1), 'Mouse movement should impart wind to the marks');
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.locator('[data-flow-position="07"]').click();
  assert.equal(await page.locator('#detail-number').textContent(), 'POSICIÓN 07');
  await page.locator('#proposal-cta').click();
  assert.equal(await page.locator('#payment-modal').isVisible(), true);
  assert.equal(await page.locator('#payment-position').textContent(), '07');
  assert.equal(await page.locator('#payment-preview-note').isVisible(), true);
  assert.equal(await page.locator('#bid-continue').isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#payment-modal').isVisible(), false);
  await page.locator('[data-ledger-tab="history"]').click();
  assert.match(await page.locator('#ledger-content').textContent(), /primera oferta verificada/);

  // Simulate transport failure only in this browser; a retry restores real data.
  await page.route('**/api/build/payment-intent', (route) => route.fulfill({ status: 503, json: { error: 'offline fixture' } }));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('build-auction-refresh')));
  await page.locator('[data-auction-retry]').waitFor();
  assert.equal(await page.locator('#proposal-cta').isDisabled(), true);
  await page.unroute('**/api/build/payment-intent');
  await page.locator('[data-auction-retry]').click();
  await page.locator('[data-ledger-tab="positions"]').click();
  await page.locator('.ledger-row').first().waitFor();
  assert.equal(await page.locator('#proposal-cta').isDisabled(), false);

  // Paid-leader fixture verifies the visual contract without a charge or DB write.
  const fixture = structuredClone(snapshot);
  fixture.positions[6] = { ...fixture.positions[6], currentBrand: 'Fixture brand', currentOfferCents: 750000,
    nextOfferCents: 800000, bidCount: 1, logoUrl: '/imgs/logo-cord-navy.png', websiteUrl: 'https://example.com/' };
  fixture.history = [{ id: 'fixture', positionId: '07', brandName: 'Fixture brand', offerAmountCents: 750000,
    status: 'outbid_refunding', at: new Date().toISOString() }];
  await page.route('**/api/build/payment-intent', (route) => route.fulfill({ json: fixture }));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('build-auction-refresh')));
  await page.locator('.cord-mark[href="https://example.com/"]').waitFor();
  assert.equal(await page.locator('.cord-mark[href="https://example.com/"]').getAttribute('rel'), 'noopener noreferrer sponsored');
  assert.equal(await page.locator('#detail-number').textContent(), 'POSICIÓN 07');
  await page.locator('[data-ledger-tab="history"]').click();
  assert.match(await page.locator('#ledger-content').textContent(), /reembolso en proceso/);
  await page.unroute('**/api/build/payment-intent');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('build-auction-refresh')));
  await page.locator('[data-ledger-tab="positions"]').click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.ledger-row').first().waitFor();
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
  assert.ok(width.scroll <= width.viewport + 1, JSON.stringify(width));
  const money = page.locator('.ledger-row > div:nth-child(3)').first();
  assert.equal(await money.isVisible(), true, 'Mobile must retain the amount');
  const mobileCord = await page.locator('.cord-flow').boundingBox();
  assert.ok(Math.abs(mobileCord.x) <= 2 && Math.abs(mobileCord.width - 390) <= 2, JSON.stringify(mobileCord));
  await page.screenshot({ path: join(output, 'mobile.png'), fullPage: true });
  await page.locator('.founder-bento').screenshot({ path: join(output, 'edition-mobile.png') });
  await page.locator('.cord-flow').screenshot({ path: join(output, 'cords-mobile.png') });
  await page.locator('.auction-ledger').screenshot({ path: join(output, 'ledger-mobile.png') });
  assert.deepEqual(errors, []);
  console.log(`Build UI passed: live feed, selection, preview, retry, leader logo, refund state, mobile. Screenshots: ${output}`);
} finally {
  await browser.close();
}
