/**
 * IPET LEAD ASSETS HUB · 云端线索持久化与实时同步 Serverless 接口
 * 部署于 Vercel Serverless Function: /api/sync
 *
 * 功能:
 * - GET    /api/sync       获取云端最新全量线索资产
 * - POST   /api/sync       入库新线索（乐观锁 + 查重）
 * - DELETE /api/sync?id=xx 软删除（?hard=1 物理删除）
 *
 * 存储通过 lib/lead_store.js 抽象，默认 GitHub Contents API，可切 LEAD_STORE=file。
 */

const {
  applyCors,
  rateLimit,
  clientIp,
  requireHubToken,
  noStore,
  handlePreflight
} = require('../lib/security');
const { createLeadStore } = require('../lib/lead_store');

const store = createLeadStore();

module.exports = async (req, res) => {
  applyCors(req, res);
  noStore(res);

  if (handlePreflight(req, res)) return;

  const rl = rateLimit(`sync:${clientIp(req)}:${req.method}`, 120, 60_000);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(Math.ceil((rl.retryAfterMs || 60000) / 1000)));
    return res.status(429).json({ success: false, error: 'Rate limit exceeded', code: 'RATE_LIMITED' });
  }

  const isWrite = req.method === 'POST' || req.method === 'DELETE';
  if (!requireHubToken(req, res, { write: isWrite, purpose: 'sync' })) return;

  // GET: 读取全量线索（含墓碑，供前端合并）
  if (req.method === 'GET') {
    try {
      const leads = await store.list();
      return res.status(200).json({
        success: true,
        count: leads.filter(l => !l.deleted_at).length,
        total_with_tombstones: leads.length,
        timestamp: Date.now(),
        leads
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST: 入库或同步单条/多条线索
  if (req.method === 'POST') {
    try {
      let payload = req.body;
      if (typeof payload === 'string') {
        payload = JSON.parse(payload);
      }
      if (!payload) {
        return res.status(400).json({ success: false, error: 'Empty payload' });
      }

      const skipDuplicates = !(req.query && req.query.allow_duplicate === '1');
      const result = await store.upsert(payload, { skipDuplicates });

      if (!result.success) {
        return res.status(502).json({
          success: false,
          error: result.error || 'Failed to persist leads',
          code: 'PERSIST_FAILED',
          conflicts: result.conflicts || []
        });
      }

      const status = result.conflicts && result.conflicts.length && !result.added && !result.updated
        ? 409
        : 200;

      return res.status(status).json({
        success: status === 200,
        added: result.added,
        updated: result.updated,
        total: result.total,
        conflicts: result.conflicts || [],
        storage: result.storage,
        code: status === 409 ? 'CONFLICT_OR_DUPLICATE' : undefined
      });
    } catch (err) {
      console.error('POST /api/sync error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // DELETE: 软删除（墓碑）指定线索；?hard=1 物理删除
  if (req.method === 'DELETE') {
    try {
      const leadId = req.query?.id || (req.body && req.body.id);
      if (!leadId) {
        return res.status(400).json({ success: false, error: 'Missing lead id' });
      }
      const hard = req.query?.hard === '1' || req.query?.hard === 'true' || (req.body && req.body.hard === true);

      const result = hard
        ? await store.hardDelete(leadId)
        : await store.softDelete(leadId);

      if (!result.success) {
        const code = result.error === 'not_found' ? 404 : 502;
        return res.status(code).json({
          success: false,
          error: result.error || 'Failed to delete',
          code: result.error === 'not_found' ? 'NOT_FOUND' : 'PERSIST_FAILED'
        });
      }

      return res.status(200).json({
        success: true,
        remaining: result.remaining,
        mode: result.mode
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
};
