/// <reference lib="dom" />
/* eslint-disable no-console */
/**
 * End-to-end smoke run: throwaway MongoDB → demo seed → API + built client → headless browser.
 *   npm run build -w client && npx tsx tests/e2e/smoke.e2e.ts [screenshotDir]
 * Exits non-zero if any step fails or the browser logs errors.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JOBS_ENABLED = 'false';

const OUT = path.resolve(process.argv[2] ?? path.join(__dirname, 'screenshots'));
const DIST = path.resolve(__dirname, '..', '..', '..', 'client', 'dist');
const PORT = 4789;
const BASE = `http://127.0.0.1:${PORT}`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  if (!fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Build the client first: npm run build -w client');

  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = rs.getUri('bookly_e2e');
  process.env.APP_URL = BASE;
  process.env.CORS_ORIGINS = BASE;
  const { connectDb } = await import('../../src/config/db');
  const { createApp } = await import('../../src/app');
  const { initSocket } = await import('../../src/realtime/socket');
  const { seed } = await import('../../src/scripts/seed');
  await connectDb(process.env.MONGODB_URI);
  await seed(() => undefined);

  const root = express();
  root.use(express.static(DIST, { index: false }));
  root.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
  root.use(createApp());
  const server = http.createServer(root);
  initSocket(server);
  await new Promise<void>((r) => server.listen(PORT, r));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const errors: string[] = [];
  const results: Array<{ step: string; ok: boolean; note?: string }> = [];

  async function newPage(locale = 'en') {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2, locale });
    await ctx.addInitScript((l: string) => localStorage.setItem('bk-lang', l), locale);
    await ctx.addInitScript(() => localStorage.setItem('bk-theme', 'light'));
    const page = await ctx.newPage();
    page.on('console', (m: { type: () => string; text: () => string }) => {
      if ((m.type() === 'error' || /effect function/i.test(m.text())) && !/tile\.openstreetmap|fonts\.g|Failed to load resource/.test(m.text())) errors.push(`[console] ${m.text()}`);
    });
    page.on('pageerror', (e: Error) => errors.push(`[pageerror] ${e.message} @ ${page.url()}\n${(e.stack ?? '').split('\n').slice(0, 6).join('\n')}`));
    page.on('response', (r: { status: () => number; url: () => string; request: () => { method: () => string } }) => {
      if (r.url().includes('/api/') && r.status() >= 500) errors.push(`[api ${r.status()}] ${r.request().method()} ${r.url()}`);
    });
    return page;
  }
  let current: any = null;
  async function step(name: string, fn: () => Promise<string | void>, page?: any) {
    current = page ?? current;
    try {
      const note = await fn();
      results.push({ step: name, ok: true, note: note || undefined });
    } catch (e) {
      results.push({ step: name, ok: false, note: (e as Error).message.split('\n').slice(0, 8).join(' | ') });
      await current?.screenshot({ path: path.join(OUT, `FAIL-${name.replace(/[^a-z0-9]+/gi, '-')}.png`) }).catch(() => undefined);
    }
  }
  const shot = (page: { screenshot: (o: object) => Promise<unknown> }, name: string, fullPage = false) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage });
  async function login(page: any, email: string, password: string) {
    await page.goto(`${BASE}/login`);
    await page.fill('#l-email', email);
    await page.fill('#l-pw', password);
    await page.click('button[type=submit]');
    await page.waitForURL((u: URL) => !u.pathname.startsWith('/login'), { timeout: 15000 });
  }

  const pub = await newPage();
  current = pub;
  await step('landing (EN)', async () => {
    await pub.goto(BASE);
    await pub.getByRole('heading', { level: 1 }).waitFor();
    await pub.getByText('Nour Family Clinic').first().waitFor({ timeout: 15000 });
    await shot(pub, '01-landing-en');
  });
  await step('natural-language search', async () => {
    await pub.goto(BASE);
    await pub.fill('input[placeholder*="Try"]', 'haircut tomorrow evening in Dubai');
    await pub.getByRole('button', { name: 'Search' }).click();
    await pub.waitForURL(/\/explore\?/);
    await pub.getByText('Lumière Hair & Beauty').first().waitFor({ timeout: 15000 });
    await shot(pub, '02-explore-ai');
    return pub.url().replace(BASE, '');
  });
  await step('guest booking (salon, any stylist, pay at location)', async () => {
    await pub.goto(`${BASE}/b/lumiere-hair-beauty`);
    await pub.getByRole('heading', { name: 'Choose a service' }).waitFor();
    await shot(pub, '03-business-page');
    await pub.locator('#book button', { hasText: "Women's Haircut" }).first().click();
    await pub.getByText('No preference').click();
    await pub.locator('[role=listbox] [role=option][aria-selected=true]').waitFor();
    const slot = pub.locator('#book .grid button[aria-pressed]').first();
    await slot.waitFor({ timeout: 15000 });
    await slot.scrollIntoViewIfNeeded();
    await slot.click({ position: { x: 10, y: 10 } });
    await shot(pub, '04-wizard-slots');
    await pub.getByRole('button', { name: 'Continue' }).click();
    await pub.fill('#bk-name', 'E2E Guest');
    await pub.fill('#bk-email', 'guest@e2e.test');
    await pub.getByRole('button', { name: 'Continue' }).click();
    await pub.getByText('Pay at the location').click();
    await pub.getByRole('button', { name: 'Confirm booking' }).click();
    await pub.getByText("You’re booked!").waitFor({ timeout: 15000 });
    await shot(pub, '05-booking-success');
    return (await pub.locator('p.num.text-xl').first().textContent()) ?? '';
  });
  await step('guest booking with required custom fields + online sandbox payment (clinic)', async () => {
    await pub.goto(`${BASE}/b/nour-family-clinic`);
    await pub.locator('#book button', { hasText: 'General Consultation' }).first().click();
    const slot = pub.locator('button[aria-pressed]').first();
    await slot.waitFor({ timeout: 15000 });
    await slot.click();
    await pub.getByRole('button', { name: 'Continue' }).click();
    await pub.fill('#bk-name', 'Clinic Guest');
    await pub.fill('#bk-email', 'clinic.guest@e2e.test');
    await pub.getByRole('button', { name: 'Continue' }).click();
    // Required "Date of birth" must block progress.
    await pub.getByText('Required').first().waitFor();
    await pub.fill('#cf-dateOfBirth', '1990-05-01');
    await pub.getByRole('button', { name: 'Continue' }).click();
    await pub.getByText('Deposit due now').waitFor();
    await pub.getByRole('button', { name: 'Confirm booking' }).click();
    await pub.waitForURL(/\/pay\/test\//, { timeout: 15000 });
    await pub.getByRole('button', { name: 'Approve payment' }).waitFor();
    await shot(pub, '06-sandbox-checkout');
    await pub.getByRole('button', { name: 'Approve payment' }).click();
    await pub.waitForURL(/\/track\?/, { timeout: 15000 });
  });

  const owner = await newPage();
  current = owner;
  await step('owner dashboard overview', async () => {
    await login(owner, 'clinic@bookly.dev', 'Owner123!');
    await owner.getByText('Bookings & revenue').waitFor({ timeout: 15000 });
    await owner.waitForTimeout(800);
    await shot(owner, '07-dashboard-overview');
  });
  await step('calendar week view', async () => {
    await owner.getByRole('link', { name: 'Calendar' }).click();
    await owner.getByRole('tab', { name: 'Week' }).click();
    await owner.waitForTimeout(800);
    await shot(owner, '08-calendar-week');
  });
  await step('reservations: confirm a pending request + detail sheet', async () => {
    await owner.getByRole('link', { name: 'Reservations' }).click();
    await owner.locator('tbody tr').first().waitFor({ timeout: 15000 });
    await owner.locator('tbody tr').first().click();
    await owner.getByText('Internal notes').waitFor();
    await shot(owner, '09-booking-sheet');
    await owner.keyboard.press('Escape');
  });
  await step('services & settings pages render', async () => {
    await owner.getByRole('link', { name: 'Services' }).click();
    await owner.getByRole('heading', { name: 'Services' }).waitFor();
    await owner.getByText('General Consultation').first().waitFor();
    await owner.getByRole('button', { name: 'New service' }).click();
    await owner.getByRole('button', { name: 'Save changes' }).click();
    await owner.getByText('Required').first().waitFor(); // client-side validation
    await owner.keyboard.press('Escape');
    await owner.getByRole('link', { name: 'Settings' }).click();
    await owner.getByRole('tab', { name: 'Branding' }).click();
    await owner.waitForTimeout(400);
    await shot(owner, '10-settings-branding');
  });

  const admin = await newPage();
  current = admin;
  await step('admin overview + approve pending business', async () => {
    await login(admin, 'admin@bookly.dev', 'Admin123!');
    await admin.getByText('Platform overview').first().waitFor({ timeout: 15000 });
    await admin.waitForTimeout(800);
    await shot(admin, '11-admin-overview');
    await admin.goto(`${BASE}/admin/businesses?status=pending`);
    await admin.getByText('Velvet Barber Lounge').waitFor();
  });

  const ar = await newPage('ar');
  current = ar;
  await step('Arabic RTL landing', async () => {
    await ar.goto(BASE);
    await ar.getByText('احجز موعدك').first().waitFor();
    const dir = await ar.evaluate(() => document.documentElement.dir);
    if (dir !== 'rtl') throw new Error(`dir=${dir}`);
    await shot(ar, '12-landing-ar');
  });
  await step('Arabic customer account (sara)', async () => {
    await login(ar, 'sara@example.com', 'Customer123!');
    await ar.getByText('مرحباً').first().waitFor({ timeout: 15000 });
    await shot(ar, '13-account-ar');
  });
  await step('Arabic business page + wizard', async () => {
    await ar.goto(`${BASE}/b/bright-minds-tutoring`);
    await ar.getByText('اختر الخدمة').waitFor();
    await shot(ar, '14-business-ar');
  });

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  const mp = await mobile.newPage();
  current = mp;
  await step('mobile landing', async () => {
    await mp.goto(BASE);
    await mp.getByRole('heading', { level: 1 }).waitFor();
    const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await shot(mp, '15-mobile-landing');
    if (overflow > 1) throw new Error(`horizontal overflow ${overflow}px`);
  });

  await browser.close();
  server.close();
  await mongoose.disconnect();
  await rs.stop();

  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.step}${r.note ? `  — ${r.note}` : ''}`);
  if (errors.length) console.log(`\nBrowser/API errors (${errors.length}):\n${[...new Set(errors)].slice(0, 30).join('\n')}`);
  console.log(`\nScreenshots: ${OUT}`);
  process.exit(results.every((r) => r.ok) && !errors.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
