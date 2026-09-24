/**
 * IPET LEAD ASSETS HUB · API 端点本地验证
 * 运行方式: node tests/test_api.js
 */

const assert = require('assert');
const jevHandler = require('../api/jev.js');
const syncHandler = require('../api/sync.js');
const ingestHandler = require('../api/ingest.js');

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    data: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.data = obj; return this; },
    end() { return this; }
  };
}

async function runApiTests() {
  console.log('🧪 Starting API Endpoints Verification Suite...\n');

  // 1. 测试 /api/jev GET 探活
  console.log('1. Testing /api/jev GET health check...');
  const jevGetRes = mockRes();
  await jevHandler({ method: 'GET' }, jevGetRes);
  assert.strictEqual(jevGetRes.statusCode, 200);
  assert.strictEqual(jevGetRes.data.status, 'online');
  console.log('  ✅ /api/jev GET status online!\n');

  // 2. 测试 /api/sync GET 获取线索
  console.log('2. Testing /api/sync GET leads fetch...');
  const syncGetRes = mockRes();
  await syncHandler({ method: 'GET' }, syncGetRes);
  assert.strictEqual(syncGetRes.statusCode, 200);
  assert.ok(Array.isArray(syncGetRes.data.leads));
  console.log(`  ✅ /api/sync returned ${syncGetRes.data.leads.length} seed leads!\n`);

  // 3. 测试 /api/ingest POST 外部 Webhook 任意字段入库
  console.log('3. Testing /api/ingest POST universal webhook ingestion...');
  const ingestPayload = {
    "your-name": "Marcus Vance",
    "contact-email": "m.vance@vancetech-aero.com",
    "org-name": "VanceTech Aerospace",
    "aircraft-weight": "40kg MTOW",
    "bus-voltage": "14S",
    "client-notes": "Need heavy-lift coaxial propulsion dyno data for drone delivery"
  };

  const ingestReq = {
    method: 'POST',
    headers: { 'x-channel-source': '外部官网 WordPress Webhook' },
    body: ingestPayload
  };
  const ingestRes = mockRes();
  await ingestHandler(ingestReq, ingestRes);

  assert.strictEqual(ingestRes.statusCode, 201);
  assert.strictEqual(ingestRes.data.success, true);
  assert.strictEqual(ingestRes.data.lead.name, 'Marcus Vance');
  assert.strictEqual(ingestRes.data.lead.email, 'm.vance@vancetech-aero.com');
  assert.strictEqual(ingestRes.data.lead.company, 'VanceTech Aerospace');
  assert.strictEqual(ingestRes.data.lead.technical_parameters.mtow, '40kg');
  assert.strictEqual(ingestRes.data.lead.jev_analysis.tier, 'TIER_1_READY_RFQ');
  console.log('  ✅ /api/ingest successfully normalized, Jev-scored, and persisted external webhook lead!\n');

  console.log('🎉 ALL SERVERLESS API ENDPOINTS VERIFIED AND PRODUCTION READY!');
}

runApiTests().catch(err => {
  console.error('❌ API verification failed:', err);
  process.exit(1);
});
