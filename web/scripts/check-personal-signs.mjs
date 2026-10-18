// Browser integration checks with synthetic camera/landmarks and mocked Supabase.
// This does not validate live GitHub, provider configuration, or real recognition accuracy.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const port = 5188;
const origin = `http://127.0.0.1:${port}`;
const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
const storageKey = 'sb-signline-test-auth-token';
const sdkUrl = 'https://signline-test.supabase.co';
const rows = [];
const failures = [];
let loseFirstSaveResponse = true;
let serverOutput = '';
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: new URL('../', import.meta.url),
  env: { ...process.env, VITE_SUPABASE_URL: sdkUrl, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', chunk => { serverOutput += chunk; });
server.stderr.on('data', chunk => { serverOutput += chunk; });
let browser;
let debugPage;

function session(id, name) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return { access_token: `${encode({ alg: 'HS256' })}.${encode({ sub: id, role: 'authenticated', exp: expires })}.test-signature`,
    token_type: 'bearer', refresh_token: 'test-refresh', expires_in: 3600, expires_at: expires,
    user: { id, aud: 'authenticated', role: 'authenticated', email: `${name}@example.invalid`, app_metadata: { provider: 'github', providers: ['github'] }, user_metadata: { user_name: name }, identities: [], created_at: new Date().toISOString() } };
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Test Vite failed: ${serverOutput}`);
    try { if ((await fetch(origin)).ok) return; } catch { /* wait for our own server */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Test Vite did not start: ${serverOutput}`);
}

async function fixtures(context, identity) {
  await context.addInitScript(({ key, value }) => {
    if (value && !localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value));
    window.__pose = 'HELLO'; window.__streams = []; window.__modelCloses = 0;
    navigator.mediaDevices.getUserMedia = async constraints => {
      if (constraints.audio) throw new Error('Training must never request audio');
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext('2d'); let frame = 0;
      const timer = setInterval(() => { ctx.fillStyle = frame++ % 2 ? 'white' : 'black'; ctx.fillRect(0, 0, 640, 480); }, 30);
      const stream = canvas.captureStream(30); window.__streams.push(stream);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track); track.stop = () => { clearInterval(timer); stop(); };
      }
      return stream;
    };
  }, { key: storageKey, value: identity });
  await context.route('**/node_modules/.vite/deps/@mediapipe_tasks-vision.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const FilesetResolver = { forVisionTasks: async () => ({}) };
    export const HandLandmarker = { createFromOptions: async () => ({
      close() { window.__modelCloses++; },
      detectForVideo() { return { landmarks: [Array.from({length:21}, (_,i) => ({
        x: .5 + (window.__pose === 'HELLO' ? i / 100 : 0),
        y: .5 + (window.__pose === 'NAME' ? i / 100 : 0), z:0
      }))] }; }
    }) };
  ` }));
  await context.route(`${sdkUrl}/**`, async route => {
    const request = route.request(); const url = new URL(request.url());
    const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-expose-headers': 'content-range', ...headers }, body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (url.pathname === '/auth/v1/user') return json(identity?.user ?? {});
    if (url.pathname === '/auth/v1/token') return json(session(alice, 'alice'));
    if (url.pathname === '/auth/v1/authorize') return route.fulfill({ contentType: 'text/html', body: 'GitHub OAuth redirect captured by test' });
    if (url.pathname !== '/rest/v1/personal_sign_samples') throw new Error(`Unexpected request: ${url.pathname}`);
    const token = request.headers().authorization?.slice(7);
    const userId = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub : null;
    assert(userId, 'Samples require an authenticated request');
    if (request.method() === 'POST') {
      const sample = request.postDataJSON(); assert.equal(sample.user_id, userId);
      if (rows.some(row => row.id === sample.id)) return json({ code: '23505' }, 409);
      const row = { ...sample, created_at: new Date().toISOString() }; rows.push(row);
      if (loseFirstSaveResponse) { loseFirstSaveResponse = false; return route.abort('failed'); }
      return json(row, 201);
    }
    assert.equal(url.searchParams.get('user_id'), `eq.${userId}`);
    let selected = rows.filter(row => row.user_id === userId);
    if (url.searchParams.has('label')) selected = selected.filter(row => `eq.${row.label}` === url.searchParams.get('label'));
    if (url.searchParams.has('id')) {
      const filter = url.searchParams.get('id');
      selected = selected.filter(row => filter.startsWith('eq.') ? row.id === filter.slice(3) : filter.includes(row.id));
    }
    if (request.method() === 'DELETE') {
      for (const row of selected) rows.splice(rows.indexOf(row), 1);
      return json(selected.map(row => ({ id: row.id })));
    }
    if (request.headers().accept?.includes('vnd.pgrst.object')) return selected.length === 1 ? json(selected[0]) : json({ code: 'PGRST116' }, 406);
    return json(selected, 200, { 'content-range': `0-${Math.max(selected.length - 1, 0)}/${selected.length}` });
  });
}

try {
  await waitForServer();
  browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext(); await fixtures(context, session(alice, 'alice'));
  const page = await context.newPage(); debugPage = page; page.on('pageerror', error => failures.push(error.message));
  await page.goto(`${origin}/#/training`);
  await page.getByText('Signed in as', { exact: false }).waitFor();
  await page.getByText('No examples yet.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Start camera', exact: true }).isDisabled(), true);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'Capture example').disabled);
  for (const label of ['HELLO', 'NAME']) {
    await page.getByLabel('Sign name', { exact: true }).fill(label);
    await page.evaluate(value => { window.__pose = value; }, label);
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Capture example', exact: true }).click();
      await page.getByRole('button', { name: `Save ${label}`, exact: true }).click();
      await page.getByText(`Saved an example of ${label} to your account.`, { exact: true }).waitFor();
    }
  }
  assert.equal(rows.length, 6);
  assert.equal(loseFirstSaveResponse, false, 'The lost-save-response recovery path must execute without duplicating the sample');
  await page.getByText('Your personal model is ready for 2 signs.', { exact: false }).waitFor();
  await page.evaluate(() => { window.__pose = 'HELLO'; });
  await page.getByRole('button', { name: 'Test a fresh sign', exact: true }).click();
  await page.getByRole('heading', { name: 'HELLO', exact: true }).waitFor();
  assert.equal(rows.length, 6, 'Testing must not upload or train on the fresh test sample');
  await page.screenshot({ path: '/tmp/signline-personal-signs-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile page must not overflow horizontally');
  await page.screenshot({ path: '/tmp/signline-personal-signs-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Capture example', exact: true }).click();
  await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
  await page.waitForFunction(() => window.__streams.every(s => s.getTracks().every(t => t.readyState === 'ended')));
  assert.equal(await page.getByRole('button', { name: 'Save NAME', exact: true }).count(), 0, 'Stopping must cancel pending capture');
  // A permission request completing late must not close the camera/model from a newer start.
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let delay = true;
    navigator.mediaDevices.getUserMedia = constraints => {
      if (!delay) return original(constraints);
      delay = false;
      return new Promise(resolve => { window.__releaseLateCamera = async () => resolve(await original(constraints)); });
    };
  });
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await page.waitForFunction(() => Boolean(window.__releaseLateCamera));
  await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'Capture example').disabled);
  await page.evaluate(() => window.__releaseLateCamera());
  await page.getByRole('button', { name: 'Capture example', exact: true }).click();
  await page.getByRole('button', { name: 'Discard example', exact: true }).click();
  await page.getByRole('button', { name: 'Stop camera', exact: true }).click();
  await page.waitForFunction(() => window.__streams.every(s => s.getTracks().every(t => t.readyState === 'ended')));
  // Refresh restores the account dataset and releases the previous camera.
  await page.reload(); await page.getByText('Your personal model is ready for 2 signs.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Delete HELLO', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); assert.equal(rows.length, 6);
  await page.getByRole('button', { name: 'Delete HELLO', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
  await page.getByText('Deleted your examples of HELLO.', { exact: true }).waitFor(); assert.equal(rows.length, 3);
  await page.getByText('Teach at least two different signs', { exact: false }).waitFor();
  // Sign-out must remove account UI/private data in every tab.
  const secondTab = await context.newPage(); await secondTab.goto(`${origin}/#/training`);
  await secondTab.getByText('Signed in as', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in with GitHub', exact: true }).waitFor();
  await secondTab.getByRole('button', { name: 'Sign in with GitHub', exact: true }).waitFor();
  assert.equal(await secondTab.getByRole('button', { name: 'Delete NAME', exact: true }).count(), 0);
  // Bob's session does not pick up Alice's persisted examples.
  const bobContext = await browser.newContext(); await fixtures(bobContext, session(bob, 'bob'));
  const bobPage = await bobContext.newPage(); await bobPage.goto(`${origin}/#/training`);
  await bobPage.getByText('No examples yet.', { exact: false }).waitFor();
  assert.equal(rows.length, 3); await bobContext.close();
  // OAuth uses GitHub + PKCE and a fixed callback in the same app.
  await page.getByRole('button', { name: 'Sign in with GitHub', exact: true }).click();
  await page.waitForURL(`${sdkUrl}/auth/v1/authorize**`);
  const oauth = new URL(page.url()); assert.equal(oauth.searchParams.get('provider'), 'github');
  assert.equal(oauth.searchParams.get('redirect_to'), `${origin}/?auth_callback=github`);
  assert.equal(oauth.searchParams.get('code_challenge_method'), 's256'); assert(oauth.searchParams.get('code_challenge'));
  await page.goto(`${origin}/?auth_callback=github&code=test-single-use-code`);
  await page.getByText('Signed in as', { exact: false }).waitFor();
  assert.equal(new URL(page.url()).search, '', 'OAuth code must be removed from history');
  assert.equal(new URL(page.url()).hash, '#/training');
  const rejectedContext = await browser.newContext(); await fixtures(rejectedContext, null);
  const rejectedPage = await rejectedContext.newPage();
  await rejectedPage.goto(`${origin}/?auth_callback=github&error=access_denied&error_description=private-provider-detail`);
  await rejectedPage.getByText('Could not finish GitHub sign-in.', { exact: false }).waitFor();
  assert.equal(new URL(rejectedPage.url()).search, '');
  assert(!(await rejectedPage.locator('body').innerText()).includes('private-provider-detail'));
  await rejectedContext.close();
  assert.deepEqual(failures, []);
  await context.close();
  console.log('PASS: GitHub PKCE/callback, private sample capture/save/reload, fresh model test, deletion, account isolation, cross-tab sign-out, camera cancellation, and mobile layout (mocked services).');
} catch (error) {
  if (debugPage && !debugPage.isClosed()) {
    console.error(await debugPage.locator('body').innerText());
    await debugPage.screenshot({ path: '/tmp/signline-accounts-failure.png', fullPage: true });
  }
  throw error;
} finally {
  await browser?.close(); server.kill('SIGTERM');
}
