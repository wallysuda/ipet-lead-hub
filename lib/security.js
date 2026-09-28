/**
 * IPET Lead Hub · 共享安全中间件
 * 鉴权、CORS、简易限流。密钥只从环境变量读取，禁止硬编码。
 */

const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function env(name) {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) {
    // 仍做一次比较，降低时序侧信道
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function extractToken(req) {
  const auth = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  const headerToken = req.headers && (req.headers['x-hub-token'] || req.headers['X-Hub-Token']);
  if (typeof headerToken === 'string' && headerToken.trim()) return headerToken.trim();
  if (req.query && typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return '';
}

function allowedOrigins() {
  const raw = env('HUB_ALLOWED_ORIGINS');
  const list = raw
    ? raw.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  // 默认允许同源与本地开发
  if (list.length === 0) {
    return ['null']; // 仅同源（浏览器同源不发 Origin 或发自身时单独判断）
  }
  return list;
}

function applyCors(req, res) {
  const origin = (req.headers && req.headers.origin) || '';
  const allowList = env('HUB_ALLOWED_ORIGINS')
    ? env('HUB_ALLOWED_ORIGINS').split(',').map(s => s.trim()).filter(Boolean)
    : [];

  // 同源请求（无 Origin 或 Origin 为自身）始终允许
  const host = (req.headers && req.headers.host) || '';
  const isSameOrigin = !origin || (host && (origin === `https://${host}` || origin === `http://${host}`));

  let allow = isSameOrigin;
  if (!allow && origin && allowList.includes(origin)) allow = true;

  // 兼容：未配置白名单时，开发期放宽；生产请设置 HUB_ALLOWED_ORIGINS
  if (!allow && allowList.length === 0 && process.env.NODE_ENV !== 'production') {
    allow = true;
  }

  if (allow && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Hub-Token, X-Hub-Secret, X-Channel-Source');
  res.setHeader('Access-Control-Max-Age', '600');
  return allow || !origin;
}

// --- 简易内存限流（单实例；生产可换 Redis） ---
const buckets = new Map();

function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const rec = buckets.get(key);
  if (!rec || now - rec.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return { ok: true, remaining: limit - 1 };
  }
  rec.count += 1;
  if (rec.count > limit) {
    return { ok: false, remaining: 0, retryAfterMs: windowMs - (now - rec.start) };
  }
  return { ok: true, remaining: limit - rec.count };
}

function clientIp(req) {
  const fwd = req.headers && (req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For']);
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return (req.headers && req.headers['x-real-ip']) || 'unknown';
}

/**
 * 校验 Hub 访问令牌。
 * - 未配置 HUB_API_TOKEN 时：拒绝写操作与付费研判（fail-closed），只读接口可放行以便迁移。
 * - 已配置则必须 Bearer / X-Hub-Token 匹配。
 */
function requireHubToken(req, res, { write = false, purpose = 'api' } = {}) {
  const expected = env('HUB_API_TOKEN');
  const token = extractToken(req);

  if (!expected) {
    if (write || purpose === 'jev') {
      res.status(503).json({
        success: false,
        error: 'Server not configured. Set HUB_API_TOKEN in Vercel Environment Variables.',
        code: 'AUTH_NOT_CONFIGURED'
      });
      return false;
    }
    // 只读且未配置 token：允许（迁移窗口），但响应头提示
    res.setHeader('X-Hub-Auth', 'open-readonly');
    return true;
  }

  if (!token || !timingSafeEqual(token, expected)) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized. Provide Authorization: Bearer <HUB_API_TOKEN>.',
      code: 'UNAUTHORIZED'
    });
    return false;
  }
  return true;
}

/** Webhook 专用：X-Hub-Secret 或 Bearer 均可 */
function requireWebhookSecret(req, res) {
  const expected = env('HUB_WEBHOOK_SECRET') || env('HUB_WRITE_TOKEN') || env('HUB_API_TOKEN');
  if (!expected) {
    res.status(503).json({
      success: false,
      error: 'Webhook auth not configured. Set HUB_WEBHOOK_SECRET.',
      code: 'AUTH_NOT_CONFIGURED'
    });
    return false;
  }
  const secret = (req.headers && (req.headers['x-hub-secret'] || req.headers['X-Hub-Secret'])) || '';
  const token = extractToken(req);
  if (timingSafeEqual(secret, expected) || timingSafeEqual(token, expected)) return true;
  res.status(401).json({ success: false, error: 'Unauthorized webhook.', code: 'UNAUTHORIZED' });
  return false;
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

function handlePreflight(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

module.exports = {
  SAFE_METHODS,
  applyCors,
  rateLimit,
  clientIp,
  requireHubToken,
  requireWebhookSecret,
  noStore,
  handlePreflight,
  timingSafeEqual,
  extractToken,
  env
};
