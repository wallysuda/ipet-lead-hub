/**
 * LeadStore 单元测试 · node tests/test_lead_store.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { FileLeadStore, findDuplicate, normalizeCompany } = require('../lib/lead_store');

async function main() {
  const tmp = path.join(os.tmpdir(), `lead_store_test_${Date.now()}.json`);
  const store = new FileLeadStore(tmp);

  // 1. upsert 新建
  let r = await store.upsert({
    id: 'L1',
    name: 'Alice',
    email: 'alice@aero.com',
    company: 'Aero Systems Inc.',
    phone: '+1 555 0100'
  });
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.added, 1);
  assert.strictEqual(r.total, 1);

  // 2. 同邮箱合并更新，sync_version 递增
  r = await store.upsert({
    id: 'L1',
    name: 'Alice',
    email: 'alice@aero.com',
    company: 'Aero Systems',
    sync_version: 1
  });
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.updated, 1);
  assert.strictEqual(r.added, 0);

  let leads = await store.list();
  assert.strictEqual(leads.length, 1);
  assert.strictEqual(leads[0].sync_version, 2);
  assert.strictEqual(leads[0].company, 'Aero Systems');

  // 3. 乐观锁冲突：更旧的 version
  r = await store.upsert({
    id: 'L1',
    name: 'Alice Stale',
    email: 'alice@aero.com',
    sync_version: 1
  });
  assert.strictEqual(r.conflicts.length, 1);
  assert.strictEqual(r.updated, 0);

  // 4. 查重
  const dup = findDuplicate(await store.list(), {
    name: 'Alice',
    email: 'ALICE@AERO.COM',
    company: 'Aero Systems LLC'
  });
  assert.ok(dup && dup.reason === 'email');

  const dupName = findDuplicate([
    { id: 'X', name: 'Bob Smith', email: 'b@x.com', company: 'Foo Industries Ltd' }
  ], {
    name: 'Bob Smith',
    email: 'other@x.com',
    company: 'Foo Industries'
  });
  assert.ok(dupName && dupName.reason === 'company_name', 'company_name should match');

  const dupDomain = findDuplicate([
    { id: 'Y', name: 'Carol Lee', email: 'carol@nova-aero.com', company: 'Nova Aero' }
  ], {
    name: 'Carol L',
    email: 'c.lee@nova-aero.com',
    company: 'Nova Aero Inc'
  });
  assert.ok(dupDomain && dupDomain.reason === 'company_domain', 'company_domain should match');

  // 5. 软删除墓碑
  r = await store.softDelete('L1');
  assert.strictEqual(r.success, true);
  assert.strictEqual(r.mode, 'soft');
  leads = await store.list();
  assert.strictEqual(leads.length, 1);
  assert.ok(leads[0].deleted_at);

  // 已删不参与查重
  const afterDel = findDuplicate(leads, { email: 'alice@aero.com' });
  assert.strictEqual(afterDel, null);

  // 6. 同 id 再 upsert 不会因墓碑变成新记录（合并保留墓碑除非显式覆盖）
  r = await store.upsert({ id: 'L1', name: 'Alice', email: 'alice@aero.com', deleted_at: null, sync_version: leads[0].sync_version });
  leads = await store.list();
  assert.strictEqual(leads.length, 1);

  // 7. 硬删除
  r = await store.hardDelete('L1');
  assert.strictEqual(r.success, true);
  leads = await store.list();
  assert.strictEqual(leads.length, 0);

  // 8. company 归一
  assert.strictEqual(normalizeCompany('Foo Industries Ltd.'), 'foo industries');

  fs.unlinkSync(tmp);
  console.log('OK: test_lead_store passed');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
