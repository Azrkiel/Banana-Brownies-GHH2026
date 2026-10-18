// Exercise real video playback with delayed tracking models; no physical devices.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const origin = 'http://127.0.0.1:5190';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5190', '--strictPort'], {
  cwd: new URL('../', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', chunk => { output += chunk; });
server.stderr.on('data', chunk => { output += chunk; });
let browser;
const errors = [];

try {
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null || attempt > 100) throw new Error(`Vite failed: ${output}`);
    try { if ((await fetch(origin)).ok) break; } catch { /* Wait for our server. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/chromium', args: ['--no-sandbox'] });
  for (const route of ['bench', 'record']) {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      window.__streams = [];
      window.__trackers = [];
      window.__closed = 0;
      navigator.mediaDevices.getUserMedia = async constraints => {
        if (constraints.audio !== false) throw new Error('Unexpected microphone request');
        if (window.__denyCamera) throw new DOMException('Denied', 'NotAllowedError');
        if (window.__holdCamera) await new Promise(resolve => { window.__grantCamera = resolve; });
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d');
        let frame = 0;
        const timer = setInterval(() => {
          ctx.fillStyle = frame++ % 2 ? '#d8c9b0' : '#d4c6ac';
          ctx.fillRect(0, 0, 640, 480);
        }, 30);
        const stream = canvas.captureStream(30);
        window.__streams.push(stream);
        for (const track of stream.getTracks()) {
          const stop = track.stop.bind(track);
          track.stop = () => { clearInterval(timer); stop(); };
        }
        return stream;
      };
    });
    await context.route('**/src/lib/landmarks.ts', request => request.fulfill({ contentType: 'text/javascript', body: `
      export async function createTracker() {
        await new Promise((resolve, reject) => window.__trackers.push({ resolve, reject }));
        return {
          detect(video, t) { return { t, w: 640, h: 480, pose: null, hands: [], brow: null }; },
          close() { window.__closed++; }
        };
      }
    ` }));
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/#/${route}`);
    await page.locator('.camera-stage__placeholder').waitFor();
    assert.equal(await page.evaluate(() => window.__streams.length), 0, 'Entry must not request a camera');
    if (route === 'record') {
      assert(await page.getByRole('button', { name: 'Start camera', exact: true }).isDisabled());
      await page.getByRole('checkbox', { name: /I consent/ }).check();
      await page.getByPlaceholder('e.g. liv').fill('test');
    }
    const start = page.getByRole('button', { name: 'Start camera', exact: true });
    const stop = page.getByRole('button', { name: 'Stop camera', exact: true });
    const record = page.getByRole('button', { name: /^Start recording/ });
    const placeholderCount = () => page.locator('.camera-stage__placeholder').count();

    await page.evaluate(() => { window.__holdCamera = true; });
    await start.click();
    await page.waitForFunction(() => !!window.__grantCamera);
    assert.equal(await placeholderCount(), 0, 'No illustration overlay while requesting the camera');
    assert.match(await page.locator('.camera-stage__label').innerText(), /Starting camera/);
    await page.evaluate(() => { window.__holdCamera = false; window.__grantCamera(); });
    await page.waitForFunction(() => window.__trackers.length === 1);
    assert(await page.locator('video').evaluate(video => !video.paused && video.readyState >= 2));
    assert.equal(await placeholderCount(), 0, 'Live video must be unobscured while models are pending');
    assert.match(await page.locator('.camera-stage__label').innerText(), /Local preview/);
    await page.getByText('Loading tracking models…', { exact: true }).waitFor();
    if (route === 'record') assert(await record.isDisabled(), 'Playback alone must not enable recording');

    await stop.click();
    await page.locator('.camera-stage__placeholder').waitFor();
    assert(await page.evaluate(() => window.__streams[0].getTracks().every(track => track.readyState === 'ended')));
    await start.click();
    await page.waitForFunction(() => window.__trackers.length === 2);
    await page.evaluate(() => window.__trackers[0].resolve());
    await page.waitForFunction(() => window.__closed === 1);
    assert(await page.locator('video').evaluate(video => !!video.srcObject && !video.paused), 'An old model completion must not detach the restarted video');
    assert.equal(await placeholderCount(), 0);
    if (route === 'record') assert(await record.isDisabled());
    await page.evaluate(() => window.__trackers[1].resolve());
    await page.getByText('Loading tracking models…', { exact: true }).waitFor({ state: 'hidden' });
    if (route === 'record') assert(await record.isEnabled(), 'Recording requires both playback and tracking');
    await stop.click();
    await page.locator('.camera-stage__placeholder').waitFor();
    assert(await page.evaluate(() => window.__streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))));

    await page.evaluate(() => { window.__denyCamera = true; });
    await start.click();
    await page.getByText('Camera access was denied. Allow camera access, then try again.', { exact: true }).waitFor();
    assert.equal(await placeholderCount(), 1);
    assert.match(await page.locator('.camera-stage__label').innerText(), /Camera off/);
    await stop.click();
    await page.evaluate(() => { window.__denyCamera = false; });
    await start.click();
    await page.waitForFunction(() => window.__trackers.length === 3);
    await page.evaluate(() => window.__trackers[2].reject(new Error('Model unavailable')));
    await page.getByText('Could not start tracking. Check your camera and local model files, then try again.', { exact: true }).waitFor();
    assert.equal(await placeholderCount(), 1);
    assert.match(await page.locator('.camera-stage__label').innerText(), /Camera off/);
    assert(await page.evaluate(() => window.__streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'))));
    if (route === 'record') assert(await record.isDisabled());
    await context.close();
    console.log(`PASS ${route}: delayed camera/models, unobscured playback, recording gates, stop/restart, late completion and failures`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
