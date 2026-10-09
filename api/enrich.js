/**
 * IPET Lead Hub · 询盘自动背调 API
 * POST /api/enrich  { company, email, name, job_title, text }
 *
 * 只做公开网页信号抓取：邮箱域名官网、DuckDuckGo Instant Answer、启发式行业匹配。
 * 结果可被前端人工修正覆盖（enrichment_manual），禁止把背调当唯一真源。
 */

const https = require('https');
const http = require('http');
const {
  applyCors,
  rateLimit,
  clientIp,
  requireHubToken,
  noStore,
  handlePreflight
} = require('../lib/security');

function env(name) {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function getGeminiKey() {
  return env('GEMINI_API_KEY');
}

function callGeminiJson(apiKey, prompt) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096
      }
    });

    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const parsed = JSON.parse(data);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
              const json = JSON.parse(cleaned);
              resolve({ ok: true, data: json });
              return;
            }
          }
          resolve({ ok: false, error: data });
        } catch (e) {
          resolve({ ok: false, error: e.message });
        }
      });
    });

    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(payload);
    req.end();
  });
}

function fetchUrl(url, timeoutMs = 6000, maxBytes = 120000) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('http:') ? http : https;
      const req = lib.get(url, {
        headers: {
          'User-Agent': 'IPET-Lead-Hub-Enrich/1.0 (+research)',
          'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8'
        },
        timeout: timeoutMs
      }, (res) => {
        // follow one redirect
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          res.resume();
          fetchUrl(next, timeoutMs, maxBytes).then(resolve);
          return;
        }
        let size = 0;
        let data = '';
        res.on('data', (c) => {
          size += c.length;
          if (size <= maxBytes) data += c.toString('utf8');
        });
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: data, finalUrl: url }));
      });
      req.on('error', () => resolve({ ok: false, error: 'network_error' }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'timeout' });
      });
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickMeta(html, patterns) {
  for (const re of patterns) {
    const m = String(html || '').match(re);
    if (m && m[1]) return m[1].trim().slice(0, 300);
  }
  return '';
}

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'google.com',
  'yahoo.com', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'qq.com', '163.com', '126.com', 'yeah.net', 'sina.com', 'sina.cn', 'sohu.com', 'foxmail.com', 'aliyun.com',
  'proton.me', 'protonmail.com', 'zoho.com', 'zohomail.com', 'mail.ru', 'yandex.com', 'yandex.ru',
  'gmx.com', 'gmx.de', 'gmx.net', 'web.de', 't-online.de',
  'aol.com', 'comcast.net', 'att.net', 'verizon.net', 'sbcglobal.net',
  'mail.com', 'inbox.com', 'fastmail.com'
]);

function isPublicEmailDomain(domain) {
  if (!domain) return false;
  return PUBLIC_EMAIL_DOMAINS.has(String(domain).toLowerCase().trim());
}

function isInvalidWebsiteUrl(url) {
  if (!url) return true;
  const s = String(url).toLowerCase();
  return (
    s.includes('accounts.google.com') ||
    s.includes('mail.google.com') ||
    s.includes('login.live.com') ||
    s.includes('login.microsoftonline.com') ||
    s.includes('signin') ||
    s.includes('mail.qq.com') ||
    s.includes('mail.163.com') ||
    s.includes('facebook.com/login') ||
    s.includes('linkedin.com/login') ||
    s.includes('gmail.com') ||
    s.includes('outlook.com') ||
    s.includes('hotmail.com') ||
    s.includes('yahoo.com')
  );
}

function domainFromEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e.includes('@')) return '';
  const domain = e.split('@')[1] || '';
  if (isPublicEmailDomain(domain)) return '';
  return domain;
}

function guessIndustryBlob(blob) {
  const t = String(blob || '').toLowerCase();
  const rules = [
    { key: 'uav_drone', label: '无人机/无人系统', re: /\b(uav|uas|drone|multirotor|vtol|evtol|unmanned|aerospace|aviation|propulsion|powertrain|gimbal|payload)\b/i },
    { key: 'robotics', label: '机器人/自动化', re: /\b(robot|robotics|automation|cnc|machining|manufacturing)\b/i },
    { key: 'electronics', label: '电子/微组装', re: /\b(electronics|microelectronics|smt|pcb|wire bonding|semiconductor|packaging)\b/i },
    { key: 'defense', label: '防务/安防', re: /\b(defense|defence|military|navy|army|tactical|ndaa)\b/i },
    { key: 'agri', label: '农业应用', re: /\b(agri|agriculture|spray|sprayer|crop|farm)\b/i },
    { key: 'logistics', label: '物流货运', re: /\b(logistics|cargo|delivery|freight|warehouse)\b/i },
    { key: 'consumer', label: '消费级/航模', re: /\b(hobby|toy|consumer drone|fpv|kids|plush|pet)\b/i },
    { key: 'other_industry', label: '非相关行业', re: /\b(hotel|restaurant|fashion|cosmetic|real estate|loan|casino|seo)\b/i }
  ];
  const hits = rules.filter(r => r.re.test(t)).map(r => r.key);
  const labels = rules.filter(r => r.re.test(t)).map(r => r.label);
  return { keys: hits, labels };
}

function scoreTarget(industryKeys, blob) {
  const t = String(blob || '').toLowerCase();
  if (industryKeys.includes('consumer') || industryKeys.includes('other_industry')) {
    return { is_likely_target: false, probability: 0.15 };
  }
  if (industryKeys.includes('uav_drone') || industryKeys.includes('defense') || industryKeys.includes('agri') || industryKeys.includes('logistics')) {
    return { is_likely_target: true, probability: 0.86 };
  }
  if (industryKeys.includes('robotics') || industryKeys.includes('electronics')) {
    return { is_likely_target: true, probability: 0.62 };
  }
  if (/\b(oem|rfq|procurement|powertrain|motor|esc|propeller)\b/i.test(t)) {
    return { is_likely_target: true, probability: 0.55 };
  }
  return { is_likely_target: null, probability: 0.4 };
}

async function duckDuckGo(query) {
  const q = encodeURIComponent(String(query || '').slice(0, 120));
  const res = await fetchUrl(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`, 5000, 40000);
  if (!res.ok || !res.body) return null;
  try {
    const data = JSON.parse(res.body);
    return {
      heading: data.Heading || '',
      abstract: data.AbstractText || data.Abstract || '',
      abstract_source: data.AbstractSource || '',
      abstract_url: data.AbstractURL || '',
      related: (data.RelatedTopics || []).slice(0, 3).map(x => x.Text || '').filter(Boolean)
    };
  } catch (e) {
    return null;
  }
}

async function inspectWebsite(domain) {
  if (!domain || isPublicEmailDomain(domain)) return null;
  const candidates = [
    `https://${domain}`,
    `https://www.${domain}`,
    `http://${domain}`
  ];
  for (const url of candidates) {
    const res = await fetchUrl(url, 5500, 80000);
    if (!res.ok || !res.body) continue;
    const finalUrl = res.finalUrl || url;
    if (isInvalidWebsiteUrl(finalUrl)) continue; // 坚决丢弃登录重定向链接

    const html = res.body;
    const title = pickMeta(html, [
      /<title[^>]*>([\s\S]*?)<\/title>/i,
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
    ]);
    const desc = pickMeta(html, [
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
    ]);
    const bodyText = stripTags(html).slice(0, 4000);
    return {
      domain,
      url: finalUrl,
      title: stripTags(title),
      description: stripTags(desc),
      body_excerpt: bodyText.slice(0, 500),
      http_status: res.status
    };
  }
  return null;
}

module.exports = async (req, res) => {
  applyCors(req, res);
  noStore(res);

  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(200).json({
      status: 'online',
      service: 'IPET Lead Hub · Public Web Enrichment',
      usage: 'POST { company, email, name, job_title, text }'
    });
  }

  const host = (req.headers && req.headers.host) || '';
  const origin = (req.headers && req.headers.origin) || '';
  const referer = (req.headers && req.headers.referer) || '';
  const isSameOrigin = host && ((origin && origin.includes(host)) || (referer && referer.includes(host)));

  if (!isSameOrigin) {
    if (!requireHubToken(req, res, { write: true, purpose: 'enrich' })) return;
  }

  const rl = rateLimit(`enrich:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(Math.ceil((rl.retryAfterMs || 60000) / 1000)));
    return res.status(429).json({ success: false, error: 'Rate limit exceeded', code: 'RATE_LIMITED' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    const company = String(body.company || '').trim();
    const email = String(body.email || '').trim();
    const name = String(body.name || '').trim();
    const jobTitle = String(body.job_title || body.jobTitle || '').trim();
    const text = String(body.text || body.raw_requirements || body.raw_text || '').trim();
    const rawDomain = (email && email.includes('@')) ? email.split('@')[1].toLowerCase().trim() : '';
    const isPublic = isPublicEmailDomain(rawDomain);
    const domain = domainFromEmail(email) || (!isPublicEmailDomain(body.domain) ? String(body.domain || '').trim() : '');

    const sources = [];
    const notes = [];

    if (isPublic) {
      notes.push(`客户使用公共个人邮箱（@${rawDomain}），跳过邮箱域名官网背调，保留官网字段留空`);
    }

    // 1) 邮箱域名官网（仅限企业独立域名）
    let website = null;
    if (domain) {
      website = await inspectWebsite(domain);
      if (website && website.title && !isInvalidWebsiteUrl(website.url)) {
        sources.push({ type: 'website', label: website.title, url: website.url });
      } else if (website) {
        notes.push('企业官网无法正常解析公开信息');
      }
    }

    // 2) DuckDuckGo 公司摘要
    const query = [company, domain, jobTitle, 'drone'].filter(Boolean).join(' ');
    const ddg = query ? await duckDuckGo(company || domain || name) : null;
    if (ddg) {
      if (ddg.heading || ddg.abstract) {
        sources.push({
          type: 'search',
          label: ddg.heading || company,
          url: ddg.abstract_url || '',
          snippet: ddg.abstract
        });
      }
      if (ddg.abstract_source) notes.push(`摘要来源: ${ddg.abstract_source}`);
    } else {
      notes.push('公开搜索摘要未命中，仅使用域名/文本信号');
    }

    // 3) 启发式行业与目标客群
    const blob = [company, jobTitle, text, website?.title, website?.description, website?.body_excerpt, ddg?.abstract, ddg?.heading]
      .filter(Boolean).join(' ');
    const industry = guessIndustryBlob(blob);
    const target = scoreTarget(industry.keys, blob);

    // 4) 可信度：有官网标题 / 有搜索摘要 / 只有文本
    let confidence = 'low';
    if (website && website.title && (ddg && ddg.abstract)) confidence = 'high';
    else if (website && website.title) confidence = 'medium';
    else if (ddg && ddg.abstract) confidence = 'medium';

    // 4) Gemini 3.5 Flash 智能情报研判 (0元免费配额)
    let aiEnrichResult = null;
    const apiKey = getGeminiKey();
    if (apiKey) {
      const scrapedSnippet = [
        website?.title ? `Website Title: ${website.title}` : '',
        website?.description ? `Website Meta: ${website.description}` : '',
        ddg?.abstract ? `Search Abstract: ${ddg.abstract}` : ''
      ].filter(Boolean).join(' | ');

      const aiPrompt = `You are a B2B Lead Intelligence Specialist for industrial UAV propulsion systems (IPET SYSTEM, ipetsystem.com).
Perform an authoritative B2B Background Intelligence Analysis (背调研判) for this inbound lead:
- Name: ${name || 'N/A'}
- Email: ${email || 'N/A'}
- Company: ${company || 'N/A'}
- Job Title: ${jobTitle || 'N/A'}
- Inbound Text: ${text || 'N/A'}
- Scraped Web/Search Context: ${scrapedSnippet || 'None'}

Return ONLY a valid JSON object matching this schema:
{
  "recognized_entity": "Company or Institution name, or '未具名工业无人机研发团队/个人开发者' if stealth/unnamed",
  "probable_website": "Official website URL if clearly known or verified, otherwise empty string ''",
  "industry": "Industry classification (e.g. 工业级无人机整机研制 / 垂直起降飞行器 / 高校实验室 / 云台载荷)",
  "is_target": true,
  "confidence": "high/medium/low",
  "summary": "2-3 sentences concise B2B background & procurement potential analysis (in Chinese)",
  "risk_note": "1-2 sentences of commercial/competitor intelligence risks or verification advice (in Chinese)"
}`;

      const aiCall = await callGeminiJson(apiKey, aiPrompt);
      if (aiCall.ok && aiCall.data) {
        aiEnrichResult = aiCall.data;
      }
    }

    const enrichment = {
      researched_at: new Date().toISOString(),
      query_company: company,
      query_domain: domain,
      website,
      search: ddg ? {
        heading: ddg.heading,
        abstract: ddg.abstract,
        source: ddg.abstract_source,
        url: ddg.abstract_url,
        related: ddg.related || []
      } : null,
      industry_guess: industry.labels,
      industry_keys: industry.keys,
      is_likely_target: target.is_likely_target,
      target_probability: target.probability,
      confidence,
      sources,
      notes,
      model_note: aiEnrichResult ? '由 Gemini 3.5 Flash 深度情报研判' : '基于公开网页信号的自动背调，可人工修正'
    };

    if (aiEnrichResult) {
      enrichment.ai_enrich = true;
      enrichment.recognized_entity = aiEnrichResult.recognized_entity || company;
      if (aiEnrichResult.probable_website && !isInvalidWebsiteUrl(aiEnrichResult.probable_website)) {
        if (!website) website = { url: aiEnrichResult.probable_website, title: aiEnrichResult.recognized_entity };
        enrichment.website = website;
      }
      if (aiEnrichResult.industry) {
        enrichment.industry_label = aiEnrichResult.industry;
        enrichment.industry_guess = [aiEnrichResult.industry];
      }
      if (aiEnrichResult.summary) {
        enrichment.summary = aiEnrichResult.summary;
      }
      if (aiEnrichResult.risk_note) {
        enrichment.risk_note = aiEnrichResult.risk_note;
      }
      if (typeof aiEnrichResult.is_target === 'boolean') {
        enrichment.is_likely_target = aiEnrichResult.is_target;
      }
      if (aiEnrichResult.confidence) {
        enrichment.confidence = aiEnrichResult.confidence;
      }
      sources.push({ type: 'ai', label: 'Gemini 3.5 Flash 智能背调研判' });
    }

    return res.status(200).json({
      success: true,
      enrichment
    });
  } catch (error) {
    console.error('Enrich API error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'enrich_failed',
      fallback_available: true
    });
  }
};
