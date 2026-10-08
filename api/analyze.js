/**
 * IPET Lead Hub · AI 询盘深度研判与工程邮件生成 API
 * 部署于 Vercel Serverless Function: /api/analyze
 * 
 * 核心设计:
 * 1. 严格使用 Google Gemini 官方免费 Flash 体系 (gemini-3-flash-preview / gemini-3.1-flash-lite)，成本永久 0 元；
 * 2. 注入 ipet-inquiry-responder 全部工程认知、5 大绝对红线与返璞归真三要素；
 * 3. 实时联动官网爬取与 DuckDuckGo 公开检索，实现真·动态线上联网背景透视；
 * 4. 毫秒级返回结构化四段式成果（客户画像、3组高转化标题、北美纯英文工程邮件、中文跟进备忘）。
 */

const https = require('https');
const {
  applyCors,
  rateLimit,
  clientIp,
  requireHubToken,
  noStore,
  handlePreflight,
  env
} = require('../lib/security');
const {
  SYSTEM_INSTRUCTION,
  buildUserPrompt,
  parseAiResponse
} = require('../lib/knowledge/prompt_engine');

function getGeminiKey() {
  return env('GEMINI_API_KEY');
}

function fetchUrl(url, timeoutMs = 4500, maxBytes = 60000) {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('http:') ? require('http') : https;
      const req = lib.get(url, {
        headers: {
          'User-Agent': 'IPET-Lead-Hub-AI/1.0 (+research)',
          'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8'
        },
        timeout: timeoutMs
      }, (res) => {
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
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, body: data }));
      });
      req.on('error', () => resolve({ ok: false }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false }); });
    } catch (e) {
      resolve({ ok: false });
    }
  });
}

async function quickWebCheck(company, email) {
  let context = '';
  // Try email domain first
  if (email && email.includes('@')) {
    const domain = email.split('@')[1].toLowerCase().trim();
    const publicDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'qq.com', '163.com'];
    if (!publicDomains.includes(domain)) {
      const res = await fetchUrl(`https://${domain}`, 4000);
      if (res.ok && res.body) {
        const titleMatch = res.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const descMatch = res.body.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i);
        if (titleMatch || descMatch) {
          context += `[Live Website: ${domain}] Title: ${(titleMatch ? titleMatch[1] : '').replace(/\s+/g, ' ').trim()} | Meta: ${(descMatch ? descMatch[1] : '').replace(/\s+/g, ' ').trim()}`;
        }
      }
    }
  }

  // DuckDuckGo instant summary
  const query = company || (email && email.includes('@') ? email.split('@')[1] : '');
  if (query && !context) {
    const ddgRes = await fetchUrl(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, 3500);
    if (ddgRes.ok && ddgRes.body) {
      try {
        const ddg = JSON.parse(ddgRes.body);
        if (ddg.AbstractText) {
          context += `[DuckDuckGo Public Abstract] ${ddg.AbstractText}`;
        }
      } catch (e) {}
    }
  }
  return context;
}

function callGemini(modelName, apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048
      }
    });

    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
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
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              resolve({ ok: true, text, model: modelName });
            } else {
              reject(new Error(`Empty candidates from Gemini: ${data.slice(0, 200)}`));
            }
          } else {
            resolve({ ok: false, statusCode: res.statusCode, error: data });
          }
        } catch (e) {
          reject(new Error(`Parse error from Gemini: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(14000, () => {
      req.destroy();
      reject(new Error('Gemini API timeout after 14s'));
    });

    req.write(payload);
    req.end();
  });
}

module.exports = async (req, res) => {
  applyCors(req, res);
  noStore(res);

  if (handlePreflight(req, res)) return;

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'online',
      service: 'IPET Lead Hub · Gemini Flash Intelligent Inquiry Responder',
      model: 'gemini-3.1-flash-lite',
      pricing: 'Free Tier ($0.00)',
      api_key_configured: !!getGeminiKey()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  if (!requireHubToken(req, res, { write: true, purpose: 'analyze' })) return;

  const rl = rateLimit(`analyze:${clientIp(req)}`, 20, 60_000);
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

    const apiKey = getGeminiKey();
    if (!apiKey) {
      return res.status(500).json({
        success: false,
        error: 'GEMINI_API_KEY is not configured in environment variables'
      });
    }

    const lead = {
      name: body.name || body.first_name || '',
      email: body.email || '',
      company: body.company || '',
      job_title: body.job_title || '',
      source: body.source || body.lead_source || '',
      raw_text: body.raw_text || body.requirements || body.raw_requirements || body.text || ''
    };

    let webContext = body.web_context || (body.enrichment && body.enrichment.summary) || '';
    if (!webContext && (lead.company || lead.email)) {
      webContext = await quickWebCheck(lead.company, lead.email);
    }

    const fullPrompt = `${SYSTEM_INSTRUCTION}\n\n${buildUserPrompt(lead, webContext)}`;

    // Try gemini-3.1-flash-lite first (fastest, high quality, free tier), fallback to gemini-3-flash-preview
    let callRes = await callGemini('models/gemini-3.1-flash-lite', apiKey, fullPrompt);
    if (!callRes.ok) {
      callRes = await callGemini('models/gemini-3-flash-preview', apiKey, fullPrompt);
    }

    if (!callRes.ok || !callRes.text) {
      return res.status(502).json({
        success: false,
        error: 'Failed to generate response from Gemini Flash',
        details: callRes.error
      });
    }

    const parsed = parseAiResponse(callRes.text);

    return res.status(200).json({
      success: true,
      model: callRes.model,
      cost_usd: 0.00,
      pricing: 'Free Tier',
      web_context: webContext,
      parsed: {
        persona: parsed.persona,
        subjects: parsed.subjects,
        email_body: parsed.email_body,
        chinese_brief: parsed.chinese_brief,
        follow_up_notes: parsed.follow_up_notes
      },
      raw_markdown: callRes.text
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error'
    });
  }
};
