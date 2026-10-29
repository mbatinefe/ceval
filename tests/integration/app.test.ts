import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../src/server/index.ts';

const origin = 'https://ceval.example';

test('saved finds require a valid application session', async () => {
  const response = await worker.fetch(new Request(origin + '/api/finds'), {} as Env);
  assert.equal(response.status, 401);
});

test('foreign origins cannot request sign-in codes', async () => {
  const response = await worker.fetch(new Request(origin + '/api/auth/email-otp/send-verification-otp', {
    method: 'POST', headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'shopper@example.com', type: 'sign-in' }),
  }), { BETTER_AUTH_URL: origin } as Env);
  assert.equal(response.status, 403);
});

import { before, after, beforeEach, mock } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

let mf: Miniflare;
let env: Env;
const deliveries = new Map<string, string>();
let rejectDelivery = false;

before(async () => {
  mf = new Miniflare(await convertV4MiniflareOptions({ modules: true, script: 'export default {fetch() {return new Response("test");}}',
    compatibilityDate: '2026-10-29', d1Databases: ['DB'] }));
  const db = await mf.getD1Database('DB');
  for (const file of (await readdir('db/d1/migrations')).filter((name) => name.endsWith('.sql')).sort()) {
    const sql = await readFile(`db/d1/migrations/${file}`, 'utf8');
    await db.batch(sql.split(';').filter((part) => part.trim()).map((part) => db.prepare(part)));
  }
  env = { DB: db, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: 'a-test-only-secret-with-more-than-32-characters',
    RESEND_API_KEY: 'test-transport-only', AUTH_EMAIL_FROM: 'Ceval <login@example.com>', APP_ENVIRONMENT: 'staging',
    ASSETS: { fetch: async () => new Response('<html>fixture</html>') } } as unknown as Env;
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), 'https://api.resend.com/emails', 'Only transactional delivery may leave the test');
    if (rejectDelivery) return Response.json({ message: 'provider unavailable' }, { status: 503 });
    const message = JSON.parse(String(init?.body));
    const code = message.text.match(/\b\d{6}\b/)?.[0];
    assert.ok(code, 'A usable code must be included in the email');
    deliveries.set(message.to[0], code);
    return Response.json({ id: 'test-message-id' });
  });
});
after(async () => { mock.restoreAll(); await mf?.dispose(); });
beforeEach(async () => {
  deliveries.clear(); rejectDelivery = false;
  const names = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all<{ name: string }>();
  const order = ['session', 'account', 'saved_finds', 'user', 'verification', 'rateLimit', 'app_limits'];
  for (const name of order) if (names.results.some((row) => row.name === name)) await env.DB.prepare(`DELETE FROM "${name}"`).run();
});
function request(path: string, body?: unknown, cookie?: string, options: { method?: string; ip?: string } = {}) {
  return worker.fetch(new Request(origin + path, {
    method: options.method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': options.ip ?? '192.0.2.1', ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env);
}
async function send(email: string, ip?: string) {
  return request('/api/auth/email-otp/send-verification-otp', { email, type: 'sign-in' }, undefined, { ip });
}
async function login(email = 'shopper@example.com', ip = '192.0.2.1') {
  const sent = await send(email, ip);
  assert.equal(sent.status, 200, await sent.text());
  const response = await request('/api/auth/sign-in/email-otp', { email, otp: deliveries.get(email) }, undefined, { ip });
  assert.equal(response.status, 200, await response.clone().text());
  const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
  assert.match(cookie, /ceval.session_token=/);
  return { cookie, response };
}

test('email code creates a secure verified session and cannot be replayed', async () => {
  const { cookie, response } = await login();
  assert.match(response.headers.get('set-cookie')!, /HttpOnly/i);
  assert.match(response.headers.get('set-cookie')!, /Secure/i);
  assert.match(response.headers.get('set-cookie')!, /SameSite=Lax/i);
  const me = await request('/api/me', undefined, cookie);
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, 'shopper@example.com');
  const replay = await request('/api/auth/sign-in/email-otp', { email: 'shopper@example.com', otp: deliveries.get('shopper@example.com') });
  assert.equal(replay.status, 400);
});

test('codes are hashed, expire, and fail closed after three wrong attempts', async () => {
  assert.equal((await send('shopper@example.com')).status, 200);
  const otp = deliveries.get('shopper@example.com')!;
  const row = await env.DB.prepare('SELECT value FROM verification LIMIT 1').first<{ value: string }>();
  assert.ok(row && !row.value.includes(otp));
  const wrong = otp === '111111' ? '222222' : '111111';
  for (let i = 0; i < 3; i++) assert.equal((await request('/api/auth/sign-in/email-otp', { email: 'shopper@example.com', otp: wrong })).status, 400);
  assert.equal((await request('/api/auth/sign-in/email-otp', { email: 'shopper@example.com', otp })).status, 403);
  assert.equal((await send('expired@example.com')).status, 200);
  await env.DB.prepare('UPDATE verification SET expiresAt = 0').run();
  assert.equal((await request('/api/auth/sign-in/email-otp', { email: 'expired@example.com', otp: deliveries.get('expired@example.com') })).status, 400);
});

test('resending to a differently cased address still observes the cooldown', async () => {
  assert.equal((await send('shopper@example.com')).status, 200);
  const again = await send(' SHOPPER@EXAMPLE.COM ');
  assert.equal(again.status, 429);
  assert.ok(Number(again.headers.get('retry-after')) > 0);
});

test('concurrent requests cannot exceed the deployment email allowance', async () => {
  await env.DB.prepare('INSERT INTO app_limits (key, count, resets_at) VALUES (?, ?, ?)').bind('send:deployment:day', 79, Math.floor(Date.now()/1000)+86400).run();
  const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => send(`person${i}@example.com`, `192.0.2.${i+10}`)));
  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  assert.equal(responses.filter((response) => response.status === 429).length, 7);
  const row = await env.DB.prepare('SELECT count FROM app_limits WHERE key = ?').bind('send:deployment:day').first<{ count: number }>();
  assert.equal(row?.count, 80);
});

test('delivery failures are not reported as successful code sends', async () => {
  rejectDelivery = true;
  assert.equal((await send('shopper@example.com')).status, 503);
});

test('saved demo products are deduplicated, validated and isolated by account', async () => {
  const first = await login();
  const second = await login('other@example.com', '192.0.2.2');
  const saved = { productId: 'sony-xm5', mode: 'buy' };
  assert.equal((await request('/api/finds', saved, first.cookie)).status, 200);
  assert.equal((await request('/api/finds', saved, first.cookie)).status, 200);
  const own = (await (await request('/api/finds', undefined, first.cookie)).json()).finds;
  assert.equal(own.length, 1);
  assert.equal(own[0].product.storePriceMinor, 29999);
  assert.deepEqual((await (await request('/api/finds', undefined, second.cookie)).json()).finds, []);
  await request(`/api/finds/${own[0].id}`, {}, second.cookie, { method: 'DELETE' });
  assert.equal((await (await request('/api/finds', undefined, first.cookie)).json()).finds.length, 1);
  assert.equal((await request('/api/finds', { productId: 'fabricated', mode: 'buy' }, first.cookie)).status, 400);
  await request('/api/finds', {}, first.cookie, { method: 'DELETE' });
  assert.deepEqual((await (await request('/api/finds', undefined, first.cookie)).json()).finds, []);
});

test('sign-out revokes the session and forgery never authorizes', async () => {
  const { cookie } = await login();
  assert.equal((await request('/api/auth/sign-out', {}, cookie)).status, 200);
  assert.equal((await request('/api/finds', undefined, cookie)).status, 401);
  assert.equal((await request('/api/finds', undefined, '__Secure-ceval.session_token=forged')).status, 401);
});

test('app pages redirect signed-out visitors and unsupported auth operations are closed', async () => {
  const response = await request('/app');
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/signin');
  assert.equal((await request('/api/auth/email-otp/get-verification-otp')).status, 404);
  assert.equal((await request('/api/auth/sign-up/email', {})).status, 404);
  assert.equal((await request('/api/finds', { x: 'a'.repeat(5000) })).status, 413);
});
