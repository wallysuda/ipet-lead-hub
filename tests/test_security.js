/**
 * 安全模块单元测试 · node tests/test_security.js
 */
const assert = require('assert');
const path = require('path');

process.env.HUB_API_TOKEN = 'test-token-abc';
process.env.TYPESAFE_API_KEY = ''; // 确保无模型 key
delete process.env.HUB_ALLOWED_ORIGINS;

const sec = require('../lib/security');

function mockRes() {
  const headers = {};
  return {
    statusCode: 200,
    body: null,
    headers,
    setHeader(k, v) { headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    end() { return this; }
  };
}

// 1. timingSafeEqual
assert.strictEqual(sec.timingSafeEqual('abc', 'abc'), true);
assert.strictEqual(sec.timingSafeEqual('abc', 'abd'), false);
assert.strictEqual(sec.timingSafeEqual('abc', 'ab'), false);

// 2. extractToken
assert.strictEqual(
  sec.extractToken({ headers: { authorization: 'Bearer tok123' } }),
  'tok123'
);
assert.strictEqual(
  sec.extractToken({ headers: { 'x-hub-token': 'tok456' } }),
  'tok456'
);
assert.strictEqual(sec.extractToken({ headers: {} }), '');

// 3. requireHubToken fail-closed when configured
{
  const res = mockRes();
  const ok = sec.requireHubToken({ headers: {} }, res, { write: true });
  assert.strictEqual(ok, false);
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(res.body.code, 'UNAUTHORIZED');
}
{
  const res = mockRes();
  const ok = sec.requireHubToken(
    { headers: { authorization: 'Bearer test-token-abc' } },
    res,
    { write: true }
  );
  assert.strictEqual(ok, true);
}
{
  const res = mockRes();
  const ok = sec.requireHubToken(
    { headers: { authorization: 'Bearer wrong' } },
    res,
    { write: true }
  );
  assert.strictEqual(ok, false);
}

// 4. rate limit
{
  const key = 'test-rl';
  let limited = false;
  for (let i = 0; i < 5; i++) {
    const r = sec.rateLimit(key, 3, 60_000);
    if (!r.ok) limited = true;
  }
  assert.strictEqual(limited, true);
}

// 5. Webhook secret
{
  process.env.HUB_WEBHOOK_SECRET = 'whsec';
  const res = mockRes();
  assert.strictEqual(sec.requireWebhookSecret({ headers: {} }, res), false);
  assert.strictEqual(res.statusCode, 401);
}
{
  process.env.HUB_WEBHOOK_SECRET = 'whsec';
  const res = mockRes();
  assert.strictEqual(
    sec.requireWebhookSecret({ headers: { 'x-hub-secret': 'whsec' } }, res),
    true
  );
}

// 6. 源码中不得再出现 TypeSafe key 模式
const fs = require('fs');
const files = [
  path.join(__dirname, '../js/jev_engine.js'),
  path.join(__dirname, '../api/jev.js'),
  path.join(__dirname, '../api/sync.js'),
  path.join(__dirname, '../api/ingest.js')
];
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  assert.ok(!/apikey_[a-f0-9]{8,}/i.test(src), `hardcoded key pattern in ${f}`);
  assert.ok(!/DEFAULT_TYPESAFE_API_KEY\s*=\s*["']/.test(src), `DEFAULT key assigned in ${f}`);
}

console.log('OK: test_security passed');
