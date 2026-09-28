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

function domainFromEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e.includes('@')) return '';
  return e.split('@')[1] || '';
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
  if (!domain) return null;
  const candidates = [
    `https://${domain}`,
    `https://www.${domain}`,
    `http://${domain}`
  ];
  for (const url of candidates) {
    const res = await fetchUrl(url, 5500, 80000);
    if (!res.ok || !res.body) continue;
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
      url: res.finalUrl || url,
      title: stripTags(title),
      description: stripTags(desc),
      body_excerpt: bodyText.slice(0, 500),
      http_status: res.status
    };
  }
  return { domain, url: `https://${domain}`, title: '', description: '', body_excerpt: '', http_status: 0, note: 'site_unreachable' };
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

  if (!requireHubToken(req, res, { write: true, purpose: 'enrich' })) return;

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
    const domain = domainFromEmail(email) || String(body.domain || '').trim();

    const sources = [];
    const notes = [];

    // 1) 邮箱域名官网
    let website = null;
    if (domain) {
      website = await inspectWebsite(domain);
      if (website && website.title) {
        sources.push({ type: 'website', label: website.title, url: website.url });
      } else if (website) {
        notes.push('邮箱域名官网不可访问或无法解析标题');
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
      model_note: '基于公开网页信号的自动背调，可人工修正；不得作为唯一判定依据'
    };

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
