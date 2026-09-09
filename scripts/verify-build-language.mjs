import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const origin = process.env.BUILD_TEST_ORIGIN || 'http://localhost:4321';
try {
  const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/build`, { waitUntil: 'networkidle' });
  assert.equal(new URL(page.url()).pathname, '/en/build');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.locator('#hero-title').textContent(), 'Your brand. Cord’s next chapter.');
  await page.locator('.ledger-row').first().waitFor();
  assert.equal(await page.locator('.ledger-row').count(), 10);
  assert.match(await page.locator('.build-page').innerText(), /Spots and history/);
  assert.doesNotMatch(await page.locator('.build-page').innerText(), /Tu marca|garantía|Posiciones|Consultando|meses|Próximamente/);
  await page.locator('[data-flow-position="04"]').click();
  assert.equal(await page.locator('#detail-number').textContent(), 'SPOT 04');
  assert.equal(await page.locator('#detail-label').textContent(), 'Stage · Payment');
  await page.locator('#proposal-cta').click();
  assert.match(await page.locator('.payment-sheet').innerText(), /Contact email/);
  assert.doesNotMatch(await page.locator('.payment-sheet').innerText(), /garantía|correo|oferta|Continuar/);
  await page.keyboard.press('Escape');
  await page.locator('[data-ledger-tab="history"]').click();
  assert.match(await page.locator('#ledger-content').innerText(), /History starts with the first verified bid/);

  // Persist preference through the same visible language selector as the landing.
  await page.evaluate(() => scrollTo(0, 0));
  await page.locator('a[href="/build?lang=es"]').first().click();
  await page.waitForURL(`${origin}/build`);
  assert.equal(await page.locator('html').getAttribute('lang'), 'es');
  await page.goto(`${origin}/build`, { waitUntil: 'networkidle' });
  assert.equal(new URL(page.url()).pathname, '/build', 'Saved Spanish must override browser English');
  await page.locator('a[href="/en/build?lang=en"]').first().click();
  await page.waitForURL(`${origin}/en/build`);
  await page.goto(`${origin}/build`, { waitUntil: 'networkidle' });
  assert.equal(new URL(page.url()).pathname, '/en/build');

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, []);
  console.log('Build language passed: initial detection, SSR text, form, history, ES/EN switching, saved preference, mobile.');
} finally { await browser.close(); }
