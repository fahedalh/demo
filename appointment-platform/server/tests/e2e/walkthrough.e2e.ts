/// <reference lib="dom" />
/* eslint-disable no-console */
/**
 * Records a narrated-by-captions video walkthrough of the MVP (Playwright video, .webm).
 *   npm run build -w client && npx tsx tests/e2e/walkthrough.e2e.ts <outDir>
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JOBS_ENABLED = 'false';
const OUT = path.resolve(process.argv[2] ?? path.join(__dirname, 'video'));
const DIST = path.resolve(__dirname, '..', '..', '..', 'client', 'dist');
const PORT = 4790;
const BASE = `http://127.0.0.1:${PORT}`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  Object.assign(process.env, { MONGODB_URI: rs.getUri('bookly_walk'), APP_URL: BASE, CORS_ORIGINS: BASE });
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
  const browser = await chromium.launch({ slowMo: 120 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: OUT, size: { width: 1440, height: 900 } } });
  await ctx.addInitScript(() => {
    localStorage.setItem('bk-lang', 'en');
    localStorage.setItem('bk-theme', 'light');
  });
  const page = await ctx.newPage();
  (globalThis as { __page?: unknown }).__page = page;

  /** On-screen caption so the video explains itself. */
  const caption = async (text: string, ms = 2200) => {
    await page.evaluate((t: string) => {
      let el = document.getElementById('__caption');
      if (!el) {
        el = document.createElement('div');
        el.id = '__caption';
        el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:99999;background:rgba(15,23,42,.92);color:#fff;padding:12px 22px;border-radius:14px;font:600 18px system-ui;box-shadow:0 10px 30px rgba(0,0,0,.3);max-width:80vw;text-align:center;pointer-events:none';
        document.body.appendChild(el);
      }
      el.textContent = t;
    }, text);
    await page.waitForTimeout(ms);
  };
  const scroll = async (y: number) => {
    await page.mouse.wheel(0, y);
    await page.waitForTimeout(900);
  };

  // 1. Discovery
  await page.goto(BASE);
  await page.getByText('Nour Family Clinic').first().waitFor();
  await caption('Bookly — one booking platform for clinics, salons, tutors, garages, venues & more');
  await scroll(700);
  await caption('Browse by industry or see featured businesses');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.fill('input[placeholder*="Try"]', 'dentist or doctor tomorrow morning in Riyadh');
  await caption('Search in plain language — the AI layer turns it into filters');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.waitForURL(/\/explore/);
  await page.waitForTimeout(1500);
  await caption('Filters, map view and real availability');

  // 2. Healthcare theme + booking with a doctor
  await page.goto(`${BASE}/b/nour-family-clinic`);
  await page.locator('[data-theme-preset=clinical]').waitFor();
  await caption('Healthcare businesses get a clinical layout with a doctor directory');
  await page.getByRole('button', { name: 'Details' }).first().click();
  await caption('Doctor profile: bio, services, prices and reviews');
  await page.getByRole('button', { name: /Book with Dr\./ }).click();
  await page.locator('#book button', { hasText: 'General Consultation' }).first().click();
  const slot = page.locator('#book .grid button[aria-pressed]').first();
  await slot.waitFor();
  await caption('Live availability — working hours, breaks, holidays and existing bookings respected');
  await slot.scrollIntoViewIfNeeded();
  await slot.click({ position: { x: 10, y: 10 } });
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.fill('#bk-name', 'Maria Gomez');
  await page.fill('#bk-email', 'maria@example.com');
  await page.fill('#cf-dateOfBirth', '1992-04-18');
  await page.locator('#cf-insurance').selectOption('Bupa');
  await caption('Industry-specific questions (date of birth, insurance) configured by the admin');
  await page.getByRole('button', { name: 'Continue' }).click();
  await caption('This clinic requires a 20% deposit — secure online payment');
  await page.getByRole('button', { name: 'Confirm booking' }).click();
  await page.waitForURL(/\/pay\/test\//);
  await caption('Sandbox checkout (Stripe plugs in via environment variables)');
  await page.getByRole('button', { name: 'Approve payment' }).click();
  await page.waitForURL(/\/track\?/);
  await page.waitForTimeout(1200);
  await caption('Booking confirmed — guests can track, reschedule, cancel or pay with their reference');

  // 3. Beauty theme
  await page.goto(`${BASE}/b/lumiere-hair-beauty`);
  await page.locator('[data-theme-preset=luxe]').waitFor();
  await caption('Beauty businesses get a “quiet luxury” editorial theme — same engine, different experience', 2800);
  await scroll(900);
  await page.waitForTimeout(800);

  // 4. Business owner
  await page.goto(`${BASE}/login`);
  await page.fill('#l-email', 'clinic@bookly.dev');
  await page.fill('#l-pw', 'Owner123!');
  await page.click('button[type=submit]');
  await page.getByText('Bookings & revenue').waitFor();
  await caption('The clinic owner’s dashboard: KPIs vs previous period, today’s schedule, AI no-show insights', 3000);
  await scroll(800);
  await caption('Top services, booking status, staff utilisation, peak-time heatmap');
  await page.getByRole('link', { name: 'Calendar' }).click();
  await page.getByRole('tab', { name: 'Week' }).click();
  await page.waitForTimeout(1200);
  await caption('Calendar with drag-and-drop rescheduling, status filters and click-to-book', 3000);
  await page.getByRole('link', { name: 'Reservations' }).click();
  await page.locator('tbody tr').first().waitFor();
  await page.getByRole('tab', { name: 'All' }).click();
  await page.fill('input[placeholder*="Search reference"]', 'Maria');
  await page.waitForTimeout(1200);
  await page.locator('tbody tr').first().click();
  await caption('Maria’s booking arrived in real time — with her answers, deposit and full history', 3000);
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('tab', { name: 'Policies' }).click();
  await caption('Every business sets its own payment, cancellation and reschedule policies');

  // 5. Arabic
  await page.getByRole('button', { name: 'العربية' }).first().click().catch(async () => {
    await page.locator('button[aria-label="العربية"]').first().click();
  });
  await page.waitForTimeout(1000);
  await page.getByRole('link', { name: 'نظرة عامة' }).first().click();
  await page.waitForTimeout(1200);
  await caption('Full Arabic interface with right-to-left layout — not just translated text', 3000);

  // 6. Admin
  await ctx.clearCookies();
  await page.evaluate(() => localStorage.setItem('bk-lang', 'en'));
  await page.goto(`${BASE}/login`);
  await page.locator('#l-email').waitFor();
  await page.fill('#l-email', 'admin@bookly.dev');
  await page.fill('#l-pw', 'Admin123!');
  await page.click('button[type=submit]');
  await page.waitForURL(/\/admin/);
  await page.getByText('Most booked businesses').first().waitFor();
  await page.waitForTimeout(800);
  await caption('Super admin: platform analytics, MRR, sign-ups and businesses awaiting approval', 3000);
  await page.getByRole('link', { name: 'Industries' }).click();
  await page.waitForTimeout(1000);
  await caption('New industries, booking flows, terminology and themes — configured, not coded', 3000);

  await ctx.close();
  await browser.close();
  server.close();
  await mongoose.disconnect();
  await rs.stop();
  const file = fs.readdirSync(OUT).filter((f) => f.endsWith('.webm')).map((f) => path.join(OUT, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  console.log(`VIDEO ${file}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  void (globalThis as { __page?: { screenshot: (o: object) => Promise<unknown> } }).__page?.screenshot({ path: path.join(OUT, 'fail.png') });
  process.exit(1);
});
