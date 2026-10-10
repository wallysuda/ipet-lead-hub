/**
 * 腾讯企业邮 / 通用 IMAP 回复抓取
 * 仅内置依赖 + imapflow（可选）。未装或未配置时优雅降级。
 */

function env(name) {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function pickTextPart(msg) {
  if (!msg) return '';
  if (typeof msg.text === 'string' && msg.text.trim()) return msg.text.trim();
  if (typeof msg.html === 'string' && msg.html.trim()) return stripHtml(msg.html);
  if (msg.textAsHtml) return stripHtml(msg.textAsHtml);
  return '';
}

function normalizeEmail(addr) {
  return String(addr || '').trim().toLowerCase();
}

function extractAddresses(value) {
  // value 可能是字符串或 imapflow 地址对象
  if (!value) return [];
  if (typeof value === 'string') {
    return value.split(/[,;]/).map(s => {
      const m = s.match(/[\w.+-]+@[\w.-]+\.\w+/);
      return m ? m[0].toLowerCase() : '';
    }).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap(extractAddresses);
  }
  if (value.value && Array.isArray(value.value)) {
    return value.value.map(x => normalizeEmail(x.address)).filter(Boolean);
  }
  if (value.address) return [normalizeEmail(value.address)];
  return [];
}

function mailConfig() {
  return {
    host: env('MAIL_IMAP_HOST') || 'imap.exmail.qq.com',
    port: Number(env('MAIL_IMAP_PORT') || 993),
    secure: (env('MAIL_IMAP_SECURE') || 'true') !== 'false',
    user: env('MAIL_IMAP_USER') || env('MAIL_USER'),
    pass: env('MAIL_IMAP_PASS') || env('MAIL_PASS') || env('MAIL_AUTH_CODE'),
    folder: env('MAIL_FOLDER') || 'INBOX',
    days: Number(env('MAIL_FETCH_DAYS') || 7),
    max: Number(env('MAIL_FETCH_MAX') || 40),
    mailboxName: env('MAIL_ADDRESS') || ''
  };
}

function isConfigured() {
  const c = mailConfig();
  return !!(c.user && c.pass);
}

/**
 * 拉取最近邮件并抽取：From / Date / Subject / 正文摘要
 * 返回 { messages: [...] }
 */
async function fetchRecentMessages() {
  const cfg = mailConfig();
  if (!cfg.user || !cfg.pass) {
    const err = new Error('MAIL_IMAP_USER / MAIL_IMAP_PASS 未配置');
    err.code = 'MAIL_NOT_CONFIGURED';
    throw err;
  }

  let ImapFlow;
  try {
    ImapFlow = require('imapflow').ImapFlow;
  } catch (e) {
    const err = new Error('缺少依赖 imapflow，请在项目中 npm i imapflow');
    err.code = 'MAIL_DEP_MISSING';
    throw err;
  }

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false
  });

  const out = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock(cfg.folder);
    try {
      const since = new Date(Date.now() - cfg.days * 86400000);
      // search charset utf-8 SINCE
      const uids = await client.search({ since }, { uid: true });
      const list = (uids || []).slice(-15);
      for (const uid of list) {
        try {
          const msg = await client.fetchOne(uid, {
            uid: true,
            envelope: true,
            source: true
          }, { uid: true });
          if (!msg) continue;

          let text = '';
          try {
            if (msg.source) {
              const raw = msg.source.toString('utf8');
              text = extractBodyFromRaw(raw);
            }
          } catch (e) {}

          const envl = msg.envelope || {};
          const froms = extractAddresses(envl.from);
          const tos = extractAddresses(envl.to);
          const subject = envl.subject || '';
          const date = envl.date ? new Date(envl.date).toISOString() : new Date().toISOString();

          out.push({
            uid: String(uid),
            date,
            subject,
            from: froms,
            to: tos,
            // 调用方应只持久化 snippet，body 仅用于当场匹配/调试
            body: text.slice(0, 2000),
            snippet: text.replace(/\s+/g, ' ').slice(0, 180)
          });
        } catch (e) {
          // skip single message failure
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch (e) {}
  }

  return { messages: out, config: { host: cfg.host, folder: cfg.folder, user: cfg.user } };
}

function decodeQuotedPrintable(str) {
  const cleaned = String(str || '').replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '=' && i + 2 < cleaned.length && /[0-9A-Fa-f]{2}/.test(cleaned.slice(i + 1, i + 3))) {
      bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(cleaned.charCodeAt(i));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function decodePart(body, encoding) {
  const enc = String(encoding || '').toLowerCase().trim();
  if (enc === 'base64') {
    try {
      return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
    } catch (e) {
      return body;
    }
  }
  if (enc === 'quoted-printable') {
    return decodeQuotedPrintable(body);
  }
  return body;
}

/** 从 RFC822 原始串里抽取纯净正文（支持 multipart、quoted-printable UTF-8、截断历史引用） */
function extractBodyFromRaw(raw) {
  if (!raw) return '';
  const str = String(raw);

  let targetPart = '';
  let encoding = '';
  let isHtml = false;

  // 1) 优先提取 text/plain 段
  const plainMatch = str.match(/Content-Type:\s*text\/plain[^;\r\n]*(?:;[^\r\n]*)?(?:\r?\n(?![ \t]*\r?\n)[^\r\n]+)*\r?\n\r?\n([\s\S]*?)(?=(?:\r?\n--[^\r\n]+|$))/i);
  if (plainMatch) {
    const headerBlock = plainMatch[0].slice(0, plainMatch[0].indexOf('\n\n') >= 0 ? plainMatch[0].indexOf('\n\n') : plainMatch[0].indexOf('\r\n\r\n'));
    const encMatch = headerBlock.match(/Content-Transfer-Encoding:\s*([^\r\n;]+)/i);
    if (encMatch) encoding = encMatch[1];
    targetPart = plainMatch[1];
  } else {
    // 2) 提取 text/html 段
    const htmlMatch = str.match(/Content-Type:\s*text\/html[^;\r\n]*(?:;[^\r\n]*)?(?:\r?\n(?![ \t]*\r?\n)[^\r\n]+)*\r?\n\r?\n([\s\S]*?)(?=(?:\r?\n--[^\r\n]+|$))/i);
    if (htmlMatch) {
      const headerBlock = htmlMatch[0].slice(0, htmlMatch[0].indexOf('\n\n') >= 0 ? htmlMatch[0].indexOf('\n\n') : htmlMatch[0].indexOf('\r\n\r\n'));
      const encMatch = headerBlock.match(/Content-Transfer-Encoding:\s*([^\r\n;]+)/i);
      if (encMatch) encoding = encMatch[1];
      targetPart = htmlMatch[1];
      isHtml = true;
    } else {
      // 3) 非 multipart 或纯单段邮件
      const idx = str.search(/\r?\n\r?\n/);
      const headers = idx >= 0 ? str.slice(0, idx) : '';
      const body = idx >= 0 ? str.slice(idx + (str[idx] === '\r' ? 4 : 2)) : str;
      const encMatch = headers.match(/Content-Transfer-Encoding:\s*([^\r\n;]+)/i);
      if (encMatch) encoding = encMatch[1];
      if (/Content-Type:\s*text\/html/i.test(headers) || /<html/i.test(body)) isHtml = true;
      targetPart = body;
    }
  }

  let text = decodePart(targetPart, encoding);
  if (isHtml) {
    text = stripHtml(text);
  }

  // 截断回复引文 (On ... wrote: / 在 ... 写道 / > ...)
  const lines = text.split(/\r?\n/);
  const cleanLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^>/.test(trimmed)) continue;
    if (/^On\s+.+wrote:\s*$/i.test(trimmed)) break;
    if (/^在\s*.+写道：\s*$/.test(trimmed)) break;
    if (/^---\s*Original Message\s*---/i.test(trimmed)) break;
    if (/^_{5,}/.test(trimmed)) break;
    cleanLines.push(line);
  }

  return cleanLines.join('\n').trim();
}

/**
 * 把邮件匹配到线索（按 From 邮箱，其次 Subject 提及）
 * replies: [{from, date, subject, body, snippet}]
 */
function matchRepliesToLeads(leads, messages, ourEmails = []) {
  const ours = new Set(ourEmails.map(normalizeEmail).filter(Boolean));
  const byEmail = new Map();
  for (const l of leads || []) {
    const em = normalizeEmail(l.email);
    if (em) byEmail.set(em, l);
  }

  const matched = [];
  const unmatched = [];

  for (const m of messages || []) {
    const froms = (m.from || []).map(normalizeEmail);
    const external = froms.filter(a => a && !ours.has(a));
    const pick = (external[0] || froms[0] || '');
    const lead = byEmail.get(pick);

    if (lead) {
      matched.push({ message: m, lead_id: lead.id, from: pick });
    } else {
      unmatched.push({ message: m, from: pick });
    }
  }

  return { matched, unmatched };
}

module.exports = {
  mailConfig,
  isConfigured,
  fetchRecentMessages,
  matchRepliesToLeads,
  extractBodyFromRaw,
  normalizeEmail
};
