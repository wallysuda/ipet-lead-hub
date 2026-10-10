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

const IGNORED_SENDER_PATTERNS = [
  'linkedin.com',
  'bounce.linkedin.com',
  'thomasnet.com',
  'exmail.weixin.qq.com',
  'weixin.qq.com',
  '10000@',
  'postmaster@',
  'mailer-daemon@',
  'noreply@',
  'no-reply@',
  'notifications@',
  'marketing@',
  'newsletter@',
  'news@',
  'security@',
  // 合作媒体/平台/服务商（非客户买家询盘）
  'echoblue.co.uk',
  'unmannedsystemstechnology.com'
];

function isAutomatedOrNewsletter(email) {
  const s = String(email || '').toLowerCase().trim();
  return IGNORED_SENDER_PATTERNS.some(pat => s.includes(pat));
}

module.exports = async (req, res) => {
  applyCors(req, res);
  noStore(res);
  if (handlePreflight(req, res)) return;

  const rl = rateLimit(`mail:${clientIp(req)}:${req.method}`, 30, 60_000);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(Math.ceil((rl.retryAfterMs || 60000) / 1000)));
    return res.status(429).json({ success: false, error: 'Rate limit exceeded', code: 'RATE_LIMITED' });
  }

  const host = (req.headers && req.headers.host) || '';
  const origin = (req.headers && req.headers.origin) || '';
  const referer = (req.headers && req.headers.referer) || '';
  const isSameOrigin = host && ((origin && origin.includes(host)) || (referer && referer.includes(host)));
  const isCron = !!(req.headers && req.headers['x-vercel-cron']) || (req.query && req.query.cron === '1');

  if (!isSameOrigin && !isCron) {
    if (!requireHubToken(req, res, { write: req.method !== 'GET', purpose: 'mail' })) return;
  }

  if (req.method === 'GET' && !isCron) {
    const cfg = mail.mailConfig();
    return res.status(200).json({
      success: true,
      configured: mail.isConfigured(),
      imap_host: cfg.host,
      imap_user: cfg.user ? cfg.user.replace(/(.{2})(.*)(@.*)/, '$1***$3') : '',
      folder: cfg.folder,
      fetch_days: cfg.days,
      note: mail.isConfigured()
        ? 'IMAP 已配置，可 POST {action:"sync"} 抓取回复'
        : '请配置 MAIL_IMAP_USER / MAIL_IMAP_PASS（腾讯企业邮客户端专用密码）'
    });
  }

  if (req.method !== 'POST' && !isCron) {
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

    // 智能筛选出未关联但属于真实业务联系人/潜在询盘的邮件
    const candidateInquiries = (unmatched || [])
      .filter(u => u.from && !isAutomatedOrNewsletter(u.from))
      .map(u => ({
        uid: u.message?.uid,
        from: u.from,
        date: u.message?.date,
        subject: u.message?.subject || '',
        snippet: u.message?.snippet || ''
      }));

    let ingested = 0;
    const ingestedLeads = [];
    const shouldIngestNew = body.ingest_new !== false;
    if (shouldIngestNew) {
      for (const item of candidateInquiries) {
        const norm = mail.normalizeEmail(item.from);
        const exists = leads.some(l => mail.normalizeEmail(l.email) === norm);
        if (exists) continue;
        const newLead = {
          id: `LEAD-MAIL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          name: item.from.split('@')[0],
          email: item.from,
          company: '',
          channel: 'email',
          source: `企业邮箱 (${our[0] || 'IMAP'})`,
          channel_source: '企业邮箱抓取',
          channel_scenario: `来自 ${our[0] || 'wally@ipetsystem.com'} 收件箱: ${item.subject}`,
          raw_requirements: `${item.subject}\n\n${item.snippet}`.trim(),
          notes: `来自企业邮箱收信，主题: ${item.subject}`,
          email_thread: [{
            date: item.date,
            from: item.from,
            subject: item.subject,
            snippet: item.snippet,
            source: 'imap_inbound'
          }],
          status: 'NEW',
          created_at: item.date || new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        await store.upsert(newLead);
        leads.push(newLead);
        ingestedLeads.push(newLead);
        ingested++;
      }
    }

    return res.status(200).json({
      success: true,
      fetched: messages.length,
      matched: matched.length,
      updated,
      ingested,
      new_leads: ingestedLeads,
      unmatched_count: unmatched.length,
      candidate_inquiries_count: candidateInquiries.length,
      candidate_inquiries: candidateInquiries.slice(0, 20),
      note: '企业邮箱回复匹配与线索同步完成'
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
