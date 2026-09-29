/**
 * 邮件回复闭环 API
 * POST /api/mail  action=sync  —— 拉取 IMAP 并回写线索
 * GET  /api/mail  —— 配置状态
 */

const {
  applyCors,
  rateLimit,
  clientIp,
  requireHubToken,
  noStore,
  handlePreflight,
  env
} = require('../lib/security');
const { createLeadStore } = require('../lib/lead_store');
const mail = require('../lib/mail_client');

const store = createLeadStore();

module.exports = async (req, res) => {
  applyCors(req, res);
  noStore(res);
  if (handlePreflight(req, res)) return;

  const rl = rateLimit(`mail:${clientIp(req)}:${req.method}`, 30, 60_000);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(Math.ceil((rl.retryAfterMs || 60000) / 1000)));
    return res.status(429).json({ success: false, error: 'Rate limit exceeded', code: 'RATE_LIMITED' });
  }

  if (!requireHubToken(req, res, { write: req.method !== 'GET', purpose: 'mail' })) return;

  if (req.method === 'GET') {
    const cfg = mail.mailConfig();
    return res.status(200).json({
      success: true,
      configured: mail.isConfigured(),
      imap_host: cfg.host,
      folder: cfg.folder,
      fetch_days: cfg.days,
      note: mail.isConfigured()
        ? 'IMAP 已配置，可 POST {action:"sync"} 抓取回复'
        : '请配置 MAIL_IMAP_USER / MAIL_IMAP_PASS（腾讯企业邮客户端专用密码）'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};
    const action = body.action || 'sync';

    if (action !== 'sync') {
      return res.status(400).json({ success: false, error: 'Unknown action' });
    }

    // 可选：人工粘贴一封回复到指定线索（IMAP 不可用时的兜底）
    if (body.lead_id && body.reply_text) {
      const leads = await store.list();
      const idx = leads.findIndex(l => l.id === body.lead_id);
      if (idx < 0) return res.status(404).json({ success: false, error: 'lead not found' });
      const lead = leads[idx];
      const entry = {
        date: new Date().toISOString(),
        from: body.reply_from || lead.email || 'manual',
        subject: body.reply_subject || 'Manual reply note',
        snippet: String(body.reply_text).replace(/\s+/g, ' ').slice(0, 180),
        source: 'manual'
      };
      lead.email_thread = (lead.email_thread || []).concat(entry);
      lead.last_reply_at = entry.date;
      lead.last_reply_snippet = entry.snippet;
      lead.status = 'replied';
      if (!lead.followed_up_at) lead.followed_up_at = entry.date;
      const up = await store.upsert(lead);
      return res.status(200).json({
        success: !!up.success,
        mode: 'manual',
        lead_id: lead.id,
        thread_size: lead.email_thread.length
      });
    }

    if (!mail.isConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'MAIL_NOT_CONFIGURED',
        error: '未配置腾讯企业邮 IMAP。请设置 MAIL_IMAP_USER 与 MAIL_IMAP_PASS（客户端专用密码），或使用 {lead_id, reply_text} 手动回写。'
      });
    }

    const { messages } = await mail.fetchRecentMessages();
    const leads = await store.list();
    const our = [mail.mailConfig().user, mail.mailConfig().mailboxName].filter(Boolean);
    const { matched, unmatched } = mail.matchRepliesToLeads(leads, messages, our);

    let updated = 0;
    for (const item of matched) {
      const lead = leads.find(l => l.id === item.lead_id);
      if (!lead) continue;
      const m = item.message;
      // 去重：同 date+from+snippet 已存在则跳过
      const thread = lead.email_thread || [];
      const exists = thread.some(t => t.snippet === m.snippet && t.date === m.date);
      if (exists) continue;

      // 仅存短摘要，不落整封原文到共享线索库
      thread.push({
        date: m.date,
        from: item.from,
        subject: m.subject,
        snippet: String(m.snippet || m.body || '').replace(/\s+/g, ' ').slice(0, 180),
        source: 'imap'
      });
      lead.email_thread = thread;
      lead.last_reply_at = m.date;
      lead.last_reply_snippet = m.snippet;
      lead.status = 'replied';
      if (!lead.followed_up_at) lead.followed_up_at = m.date;
      await store.upsert(lead);
      updated++;
    }

    return res.status(200).json({
      success: true,
      fetched: messages.length,
      matched: matched.length,
      updated,
      // 隐私：不返回未匹配邮件的发件人/主题/摘要，仅给数量
      unmatched_count: unmatched.length,
      note: '仅写入已匹配线索的回复短摘要；未匹配邮件不入库、不外泄正文'
    });
  } catch (err) {
    console.error('mail api error', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'mail_sync_failed',
      code: err.code || 'MAIL_ERROR'
    });
  }
};
