// Real Chromium + built ONNX worker. Smoke bytes are served only by this ephemeral test server.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright-core';
const root = resolve(new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const bundle = resolve(process.argv[2] ?? resolve(root, 'ml/out/phase5-smoke-fp16'));
const dist = resolve(root, 'web/dist'), ort = resolve(root, 'web/node_modules/onnxruntime-web/dist');
const manifest = JSON.parse(await readFile(resolve(bundle, 'manifest.json'), 'utf8'));
assert.equal(manifest.deployable, false, 'Use only an explicitly non-deployable smoke bundle for this test.');
const workerFile = (await readdir(resolve(dist, 'assets'))).find(name => /^onnxWorker-.*\.js$/.test(name));
assert.ok(workerFile, 'Run npm --prefix web run build first.');
let permitTestModel = false;
const downloads = [];
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/') { response.setHeader('content-type', 'text/html'); response.end('<title>Phase 5 worker test</title>'); return; }
    if (path === '/models/manifest.json') {
      // Test-only in-memory override. No deployable manifest/model is written into public/ or dist/.
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ ...manifest, deployable: permitTestModel })); return;
    }
    const base = path.startsWith('/models/') ? bundle : path.startsWith('/ort/') ? ort : dist;
    const relative = path.replace(/^\/(models|ort)\//, '').replace(/^\//, '');
    const target = resolve(base, relative);
    if (!target.startsWith(base + sep)) { response.writeHead(403).end(); return; }
    if (path.endsWith('.onnx')) downloads.push(path);
    response.setHeader('content-type', extname(path) === '.wasm' ? 'application/wasm' : /\.m?js$/.test(path) ? 'text/javascript' : 'application/octet-stream');
    response.end(await readFile(target));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const page = await browser.newPage();
  await page.goto(origin);
  const messages = [];
  page.on('console', message => { if (message.type() === 'error') messages.push(message.text()); });
  await page.evaluate(worker => {
    let id = 0;
    window.workerPath = worker;
    window.startWorker = () => {
      window.w?.terminate();
      window.w = new Worker(worker, { type: 'module' });
      window.ask = message => new Promise((resolve, reject) => {
        const mine = ++id;
        const timer = setTimeout(() => reject(new Error('Worker deadline exceeded')), 60000);
        const listener = event => {
          if (event.data.id !== mine) return;
          clearTimeout(timer); window.w.removeEventListener('message', listener);
          if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.result);
        };
        window.w.addEventListener('message', listener); window.w.postMessage({ ...message, id: mine });
      });
      return window.ask({ type: 'init', base: location.origin + '/models/' });
    };
  }, '/assets/' + workerFile);
  await assert.rejects(page.evaluate(() => window.startWorker()), /verified v2 model/);
  assert.equal(downloads.length, 0);
  permitTestModel = true;
  await page.evaluate(() => window.startWorker());
  assert.equal(downloads.length, 2);
  const metrics = await page.evaluate(async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 4);
    const results = [];
    for (let i = 0; i < 12; i++) results.push(await window.ask({ type: 'predict', stage: 'c1', features: new Float32Array(5568) }));
    const b = await window.ask({ type: 'predict', stage: 'b', features: new Float32Array(64*90) });
    clearInterval(timer);
    return { isolated: crossOriginIsolated, ticks, latencies: results.slice(2).map(r => r.latencyMs), c1: results.at(-1), b };
  });
  assert.equal(metrics.isolated, false); assert.ok(metrics.ticks > 0);
  assert.equal(metrics.c1.embedding.length, 192); assert.equal(metrics.b.embedding.length, 192);
  assert.ok(metrics.c1.topK.length > 0); assert.equal(typeof metrics.b.text, 'string');
  await page.evaluate(() => window.startWorker());
  assert.equal(downloads.length, 2, 'Repeat initialization must use IndexedDB with no model download.');
  await page.evaluate(hash => new Promise((resolve, reject) => {
    const request = indexedDB.open('signline_model_cache_v2', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('models', 'readwrite');
      transaction.objectStore('models').put(new ArrayBuffer(12), hash);
      transaction.oncomplete = () => { db.close(); resolve(); };
    };
  }), manifest.c1_sha256);
  await page.evaluate(() => window.startWorker());
  assert.equal(downloads.length, 3, 'Corrupt cached bytes must be re-downloaded.');
  await assert.rejects(page.evaluate(() => window.ask({ type: 'predict', stage: 'c1', features: new Float32Array(90) })), /Invalid landmark window/);
  const sorted = metrics.latencies.sort((a,b) => a-b);
  console.log(JSON.stringify({ checks: 10, modelDownloads: downloads.length, crossOriginIsolated: metrics.isolated,
    mainThreadTicks: metrics.ticks, p50Ms: sorted[5], p95Ms: sorted[9], c1Bytes: manifest.c1_size_bytes,
    bBytes: manifest.b_size_bytes, smokeOnly: true, browserErrors: messages }, null, 2));
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
