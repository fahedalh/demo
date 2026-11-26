/**
 * Cross-app browser test of the full workflow, driving real Chromium sessions:
 *   passenger books → driver gets the live offer → accepts → in-app chat → GPS simulation drives to pickup →
 *   arrives → PIN-verified start → complete → passenger rates. Screenshots → test-results/e2e.
 *
 * Requires the API and the passenger (5173) + driver (5174) dev servers running and seeded data:
 *   pnpm dev   # in another terminal
 *   pnpm test:e2e
 * Uses Playwright (`npx playwright install chromium` once if no browser is installed).
 */
const { chromium } = require('playwright');
const PASSENGER = process.env.PASSENGER_URL || 'http://127.0.0.1:5173/';
const DRIVER = process.env.DRIVER_URL || 'http://127.0.0.1:5174/';
const OUT = process.env.OUT || 'test-results/e2e';
require('node:fs').mkdirSync(OUT, { recursive: true });
const tile = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP4//8/AwAI/AL+XJ/PAAAAAElFTkSuQmCC',
  'base64',
);
async function ctx(b, opts = {}) {
  const c = await b.newContext({
    viewport: { width: 1440, height: 900 },
    geolocation: { latitude: 25.1985, longitude: 55.2796 },
    permissions: ['geolocation'],
    ...opts,
  });
  await c.route(/tile\.openstreetmap\.org|fonts\.(googleapis|gstatic)\.com/, (r) =>
    r.request().url().includes('openstreetmap') ? r.fulfill({ body: tile, contentType: 'image/png' }) : r.abort(),
  );
  return c;
}
const errs = [];
const watch = (p, name) => {
  p.on('pageerror', (e) => errs.push(`${name} pageerror: ${e.message}`));
  p.on(
    'console',
    (m) =>
      m.type() === 'error' &&
      !/401|ERR_FAILED|net::/.test(m.text()) &&
      errs.push(`${name} console: ${m.text()}`),
  );
};
async function login(p, url, id, pw) {
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.getByLabel('Email or phone').fill(id);
  await p.getByLabel('Password', { exact: true }).fill(pw);
  await p.getByRole('button', { name: 'Sign in' }).click();
}
(async () => {
  const b = await chromium.launch();
  const d = await (await ctx(b)).newPage();
  watch(d, 'driver');
  const p = await (await ctx(b)).newPage();
  watch(p, 'passenger');

  await login(d, DRIVER, 'driver@masar.demo', 'Driver123!');
  await d.waitForTimeout(2500);
  const goOnline = d.getByRole('button', { name: 'Go online' }).first();
  if (await goOnline.isVisible()) await goOnline.click();
  await d.waitForTimeout(1500);
  await d.screenshot({ path: `${OUT}/d-online.png` });

  await login(p, PASSENGER, 'passenger@masar.demo', 'Passenger123!');
  await p.waitForTimeout(3000);
  await p.getByRole('button', { name: /Where are you going/ }).click();
  await p.getByPlaceholder('Where are you going?').fill('city walk');
  await p.waitForTimeout(1000);
  await p
    .getByRole('button', { name: /City Walk/ })
    .first()
    .click();
  await p.waitForTimeout(2500);
  // pay by wallet for a clean demo
  await p
    .getByRole('button', { name: /VISA|Card|Cash|Wallet/ })
    .first()
    .click();
  await p.getByRole('button', { name: /^Wallet/ }).click();
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: /^Confirm/ }).click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/p-searching.png` });

  await d.getByRole('button', { name: 'Accept' }).waitFor({ timeout: 10000 });
  await d.screenshot({ path: `${OUT}/d-offer.png` });
  await d.getByRole('button', { name: 'Accept' }).click();
  await d.waitForTimeout(3500);
  await d.screenshot({ path: `${OUT}/d-pickup.png` });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/p-arriving.png` });

  await p.getByRole('button', { name: 'Message' }).click();
  await p.getByPlaceholder('Type a message…').fill('hello');
  await p.getByRole('button', { name: 'Send' }).click();
  await p.waitForTimeout(800);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  const pin = await p.evaluate(async () => {
    const { accessToken } = JSON.parse(sessionStorage.getItem('masar.session'));
    const r = await fetch('/api/rides/active', {
      headers: { Authorization: `Bearer ${accessToken}`, 'X-Client-App': 'passenger' },
    }).then((x) => x.json());
    return r.ride.startPin;
  });
  await d.getByRole('button', { name: 'I’ve arrived' }).click();
  await d.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/p-arrived.png` });
  await d.getByRole('button', { name: 'Start trip' }).click();
  await d.locator('input[inputmode="numeric"]').fill(pin);
  await d.getByRole('button', { name: 'Start trip' }).last().click();
  await d.waitForTimeout(4000);
  await d.screenshot({ path: `${OUT}/d-ontrip.png` });
  await p.screenshot({ path: `${OUT}/p-ontrip.png` });
  await d.getByRole('button', { name: 'Complete trip' }).click();
  // Ending the trip before the drop-off asks for confirmation.
  const confirm = d.getByRole('dialog').getByRole('button', { name: 'Complete trip' });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await d.waitForTimeout(2500);
  await d.screenshot({ path: `${OUT}/d-summary.png` });
  await p.screenshot({ path: `${OUT}/p-done.png` });
  await p.getByRole('button', { name: 'Submit rating' }).click();
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/p-after.png` });
  await d.getByRole('button', { name: 'Done' }).click();
  await d
    .getByRole('button', { name: 'Go offline' })
    .first()
    .click()
    .catch(() => {});
  console.log('PIN', pin);
  console.log(errs.length ? errs.join('\n') : '✅ end-to-end workflow passed');
  if (errs.length) process.exitCode = 1;
  await b.close();
})().catch((e) => {
  console.error('FAILED', e.message);
  console.log(errs.join('\n'));
  process.exit(1);
});
