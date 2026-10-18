// Real browser animation checks; no camera, microphone, or provider credentials.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:5189';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5189', '--strictPort'], {
  cwd: new URL('../', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', chunk => { output += chunk; });
server.stderr.on('data', chunk => { output += chunk; });
let browser;
const errors = [];

async function ready(page) {
  await page.locator('.intro-begin').waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(['perch-hand.webp', 'bird-frames.webp', 'branch-blue.webp'].map(async name => {
      const image = new Image(); image.src = `/notebook/${name}`;
      await image.decode().catch(() => {});
    }));
  });
}

async function pose(page, selector, time) {
  return page.locator(selector).evaluate((element, progress) => {
    const animation = element.getAnimations()[0];
    if (!animation) throw new Error(`Missing animation on ${element.className}`);
    animation.pause(); animation.currentTime = progress;
    const bounds = element.getBoundingClientRect();
    return { x: bounds.left + bounds.width * .44, y: bounds.top + bounds.height * .61 };
  }, time);
}

function centered(point, width, height) {
  assert(Math.abs(point.x - width / 2) < 2 && Math.abs(point.y - height / 2) < 2,
    `Bird must hand off at viewport center: ${JSON.stringify(point)}`);
}

try {
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null || attempt > 100) throw new Error(`Vite failed: ${output}`);
    try { if ((await fetch(origin)).ok) break; } catch { /* Wait for our own server. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
  for (const width of [1440, 768, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.addInitScript(() => {
      window.__deviceRequests = 0;
      navigator.mediaDevices.getUserMedia = async () => { window.__deviceRequests++; throw new Error('Entry must not request devices'); };
    });
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    await context.route('**/src/pages/Call.tsx', async route => { await pending; await route.continue(); });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin); await ready(page);
    await page.locator('.intro-begin').click();
    await page.locator('.intro-screen--departing').waitFor();
    // Repeated activation must not add a second navigation or animation.
    await page.locator('.intro-begin').evaluate(element => element.click());
    centered(await pose(page, '.bird-illustration__flight', 1599), width, 900);
    await page.locator('.bird-illustration__flight').evaluate(element => element.getAnimations()[0].finish());
    await page.locator('.bird-loading').waitFor();
    const loader = await page.locator('.bird-loading__flight').evaluate(element => {
      const r = element.getBoundingClientRect(); return { x: r.left + r.width * .44, y: r.top + r.height * .61 };
    });
    centered(loader, width, 900);
    release();
    await page.locator('.songbirds--landing').waitFor();
    centered(await pose(page, '.songbirds__welcome', 0), width, 900);
    await page.locator('.songbirds__welcome .bird-illustration__sprite').evaluate(element => {
      const a = element.getAnimations()[0]; a.pause(); a.currentTime = 0;
    });
    assert.equal(await page.locator('.songbirds__welcome').count(), 1);
    assert(await page.getByLabel('Name', { exact: true }).isEnabled(), 'Landing must not block the form');
    await pose(page, '.songbirds__welcome', 600);
    await page.locator('.songbirds__welcome .bird-illustration__sprite').evaluate(element => { element.getAnimations()[0].currentTime = 600; });
    if (width === 1440) await page.screenshot({ path: '/tmp/signline-branch-mid-flight.png' });
    await pose(page, '.songbirds__welcome', 1199);
    await page.locator('.songbirds__welcome').evaluate(element => element.getAnimations()[0].finish());
    await page.waitForFunction(() => !document.querySelector('.songbirds--landing'));
    assert.equal(await page.locator('.songbirds__welcome .bird-illustration__sprite').evaluate(element => getComputedStyle(element).backgroundPosition), '0px 0px');
    assert.equal(await page.locator('.home-page').evaluate(element => getComputedStyle(element).animationName), 'none', 'The page must not replay its entrance after landing');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No overflow at ${width}px`);
    const floor = await page.locator('.home-branch-floor').boundingBox();
    assert(Math.abs(floor.x) < 1 && Math.abs(floor.width - width) < 1, 'Bottom branch must span the viewport');
    assert(Math.abs(floor.y + floor.height - await page.evaluate(() => document.documentElement.scrollHeight)) < 2, 'Branch must meet the bottom of the page');
    assert(await page.locator('.home-branch-connector').evaluate(svg => {
      const path = svg.querySelector('path');
      const controls = [...document.querySelectorAll('.join-bar input, .join-bar select, .join-bar button')].map(element => element.getBoundingClientRect());
      const bounds = svg.getBoundingClientRect();
      for (let distance = 0; distance <= path.getTotalLength(); distance += 3) {
        const point = path.getPointAtLength(distance);
        const x = point.x + bounds.left, y = point.y + bounds.top;
        if (controls.some(rect => x > rect.left - 5 && x < rect.right + 5 && y > rect.top - 5 && y < rect.bottom + 5)) return false;
      }
      return true;
    }), 'Branch must remain clear of form controls');
    assert.equal(await page.evaluate(() => window.__deviceRequests), 0);
    await page.screenshot({ path: `/tmp/signline-branch-settled-${width}.png`, fullPage: true });
    // The settled pair also renders on a fresh direct route without a fly-in.
    await page.reload(); await page.locator('.home-page').waitFor();
    assert.equal(await page.locator('.songbirds--landing').count(), 0);
    await context.close();
    console.log(`PASS ${width}px: takeoff → delayed loader → branch landing, static direct entry, no device access`);
  }

  async function scenario(run, preferences = {}) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...preferences });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    try { await run(page, context); } finally { await context.close(); }
  }
  async function settled(page) {
    await page.locator('.home-page').waitFor();
    await page.waitForFunction(() => !document.querySelector('.songbirds--landing'));
    assert(await page.getByLabel('Name', { exact: true }).isEnabled());
  }
  await scenario(async page => {
    await page.goto(origin); await ready(page); await page.locator('.intro-begin').click(); await settled(page);
    assert.equal(await page.locator('.home-page--flight-entry').count(), 0);
  }, { reducedMotion: 'reduce' });
  await scenario(async page => {
    await page.goto(origin); await ready(page); await page.locator('.intro-begin').click(); await settled(page);
    assert.equal(await page.locator('.home-page--flight-entry').count(), 0);
  }, { forcedColors: 'active' });
  await scenario(async page => {
    await page.goto(origin); await ready(page); await page.locator('.intro-begin').click();
    await page.keyboard.press('Escape'); await settled(page);
    assert.equal(await page.locator('.home-page--flight-entry').count(), 0);
  });
  await scenario(async page => {
    await page.goto(origin); await ready(page); await page.locator('.intro-begin').click();
    await page.locator('.songbirds--landing').waitFor(); await page.emulateMedia({ reducedMotion: 'reduce' }); await settled(page);
  });
  await scenario(async page => {
    await page.goto(origin); await ready(page); await page.locator('.intro-begin').click();
    await page.locator('.songbirds--landing').waitFor(); await page.keyboard.press('Escape'); await settled(page);
  });
  await scenario(async page => {
    await page.goto(origin); await ready(page); await page.locator('.intro-begin').click();
    await page.locator('.songbirds--landing').waitFor();
    await page.addStyleTag({ content: '* { animation: none !important; }' });
    await settled(page);
  });
  await scenario(async (page, context) => {
    await context.route('**/notebook/branch-blue.webp', route => route.abort());
    await page.goto(origin); await ready(page); await page.locator('.intro-begin').click(); await settled(page);
    assert.equal(await page.locator('.home-page--flight-entry').count(), 0);
  });
  await scenario(async page => {
    await page.goto(origin); await ready(page); await page.locator('.intro-begin').click();
    await page.locator('.songbirds--landing').waitFor();
    await page.getByRole('link', { name: 'SignLine', exact: true }).click(); await ready(page);
    assert.equal(await page.locator('.intro-screen--departing').count(), 0);
    await page.locator('.intro-begin').click(); await page.locator('.songbirds--landing').waitFor(); await settled(page);
  });
  assert.deepEqual(errors, []);
  console.log('PASS reduced motion, forced colors, Escape, preference changes, disabled CSS fallback, missing art and return/replay');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
