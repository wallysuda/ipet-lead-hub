const assert = require('assert');
const { matchRepliesToLeads, extractBodyFromRaw, normalizeEmail } = require('../lib/mail_client.js');

const leads = [
  { id: 'L1', email: 'maria@aerolab.io' },
  { id: 'L2', email: 'ken@droneco.com' }
];

const messages = [
  { from: ['maria@aerolab.io'], date: '2026-01-01T00:00:00Z', subject: 'RE: quote', body: 'Please send pricing', snippet: 'Please send pricing' },
  { from: ['sales@exmail-demo.com'], date: '2026-01-02T00:00:00Z', subject: 'newsletter', body: 'hi', snippet: 'hi' },
  { from: ['ken@droneco.com'], date: '2026-01-03T00:00:00Z', subject: 'RE: powertrain', body: 'We need 65kg', snippet: 'We need 65kg' }
];

const { matched, unmatched } = matchRepliesToLeads(leads, messages, ['sales@exmail-demo.com']);
assert.strictEqual(matched.length, 2);
assert.strictEqual(unmatched.length, 1);
assert.strictEqual(matched[0].lead_id, 'L1');
assert.strictEqual(matched[1].lead_id, 'L2');
assert.strictEqual(normalizeEmail(' A@B.com '), 'a@b.com');

const raw = 'From: a@b.com\nSubject: x\n\nHello world\n> quoted line\n';
assert.ok(extractBodyFromRaw(raw).includes('Hello world'));
assert.ok(!extractBodyFromRaw(raw).includes('quoted line'));

console.log('OK: test_mail_match passed');
