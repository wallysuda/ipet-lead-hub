/**
 * IPET LEAD ASSETS HUB · 云端线索持久化与实时同步 Serverless 接口
 * 部署于 Vercel Serverless Function: /api/sync
 * 
 * 功能:
 * - GET    /api/sync       获取云端最新全量线索资产 (带内存缓存加速与防缓存标头)
 * - POST   /api/sync       入库新线索，自动去重并持久化到主库
 * - DELETE /api/sync?id=xx 作废或删除指定线索
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const REPO_OWNER = process.env.REPO_OWNER || 'wallysuda';
const REPO_NAME = process.env.REPO_NAME || 'ipet-lead-hub';
const FILE_PATH = 'data/cloud_leads.json';
const BRANCH = 'main';

function getGitHubToken() {
  return (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()) || '';
}

let memoryCache = {
  leads: null,
  sha: null,
  timestamp: 0
};

// 本地离线兜底读取
function getLocalFallbackLeads() {
  try {
    const cloudFile = path.join(process.cwd(), 'data', 'cloud_leads.json');
    if (fs.existsSync(cloudFile)) {
      return JSON.parse(fs.readFileSync(cloudFile, 'utf8'));
    }
    const seedFile = path.join(process.cwd(), 'data', 'initial_leads.json');
    if (fs.existsSync(seedFile)) {
      return JSON.parse(fs.readFileSync(seedFile, 'utf8'));
    }
  } catch (e) {}
  return [];
}

function githubApiRequest(method, apiPath, body = null) {
  return new Promise((resolve, reject) => {
    const token = getGitHubToken();
    const headers = {
      'User-Agent': 'IPET-Lead-Hub/1.0',
      'Accept': 'application/vnd.github.v3+json'
    };
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    let payload = null;
    if (body) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const options = {
      hostname: 'api.github.com',
      port: 443,
      path: apiPath,
      method: method,
      headers: headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ statusCode: res.statusCode, headers: res.headers, data: parsed });
        } catch (err) {
          resolve({ statusCode: res.statusCode, headers: res.headers, data: data });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('GitHub API request timeout'));
    });

    if (payload) req.write(payload);
    req.end();
  });
}

async function fetchLeadsFromGitHub() {
  const token = getGitHubToken();
  if (!token) {
    return { leads: getLocalFallbackLeads(), sha: null };
  }

  try {
    const res = await githubApiRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${BRANCH}&_t=${Date.now()}`);
    if (res.statusCode === 200 && res.data && res.data.content) {
      const raw = Buffer.from(res.data.content, 'base64').toString('utf8');
      const leads = JSON.parse(raw);
      memoryCache = { leads, sha: res.data.sha, timestamp: Date.now() };
      return { leads, sha: res.data.sha };
    }
  } catch (e) {
    console.error('Error fetching leads from GitHub:', e.message);
  }

  if (memoryCache.leads) return { leads: memoryCache.leads, sha: memoryCache.sha };
  return { leads: getLocalFallbackLeads(), sha: null };
}

async function commitLeadsToGitHub(leads, sha, message) {
  const token = getGitHubToken();
  if (!token) {
    // 离线/本地保存
    try {
      const cloudFile = path.join(process.cwd(), 'data', 'cloud_leads.json');
      fs.writeFileSync(cloudFile, JSON.stringify(leads, null, 2), 'utf8');
      memoryCache = { leads, sha: null, timestamp: Date.now() };
      return { success: true, localOnly: true };
    } catch (e) {
      memoryCache = { leads, sha: null, timestamp: Date.now() };
      return { success: true, memoryOnly: true };
    }
  }

  let currentSha = sha;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    if (!currentSha) {
      try {
        const checkRes = await githubApiRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${BRANCH}&_t=${Date.now()}`);
        if (checkRes.statusCode === 200 && checkRes.data && checkRes.data.sha) {
          currentSha = checkRes.data.sha;
        }
      } catch (e) {}
    }

    const fileContent = JSON.stringify(leads, null, 2);
    const body = {
      message: message || `feat(leads): sync lead via lead hub API (${leads.length} records)`,
      content: Buffer.from(fileContent, 'utf8').toString('base64'),
      branch: BRANCH
    };
    if (currentSha) body.sha = currentSha;

    const res = await githubApiRequest('PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`, body);
    if (res.statusCode === 200 || res.statusCode === 201) {
      const newSha = res.data && res.data.content ? res.data.content.sha : null;
      memoryCache = { leads, sha: newSha, timestamp: Date.now() };
      return { success: true, sha: newSha };
    }

    if (res.statusCode === 409) {
      currentSha = null;
      await new Promise(r => setTimeout(r, 600));
      continue;
    }

    console.warn(`GitHub API commit returned ${res.statusCode}, falling back to local storage.`);
    break;
  }

  // 优雅降级：若 GitHub 远程不可达或 404，安全写入本地并维护内存缓存
  try {
    const cloudFile = path.join(process.cwd(), 'data', 'cloud_leads.json');
    fs.writeFileSync(cloudFile, JSON.stringify(leads, null, 2), 'utf8');
    memoryCache = { leads, sha: null, timestamp: Date.now() };
    return { success: true, localOnly: true, note: 'Saved to local file' };
  } catch (e) {
    memoryCache = { leads, sha: null, timestamp: Date.now() };
    return { success: true, memoryOnly: true };
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET: 读取全量线索
  if (req.method === 'GET') {
    try {
      const { leads } = await fetchLeadsFromGitHub();
      return res.status(200).json({
        success: true,
        count: leads.length,
        timestamp: Date.now(),
        leads: leads
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

      const { leads: currentLeads, sha } = await fetchLeadsFromGitHub();
      let updatedLeads = [...currentLeads];

      const toAdd = Array.isArray(payload) ? payload : [payload];
      let addedCount = 0;

      for (const item of toAdd) {
        if (!item) continue;
        const leadId = item.id || `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const email = (item.email || '').trim().toLowerCase();

        // 查重与合并
        const existIdx = updatedLeads.findIndex(l => l.id === leadId || (email && l.email && l.email.trim().toLowerCase() === email));
        if (existIdx >= 0) {
          updatedLeads[existIdx] = { ...updatedLeads[existIdx], ...item, updated_at: new Date().toISOString() };
        } else {
          updatedLeads.unshift({
            ...item,
            id: leadId,
            created_at: item.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
          addedCount++;
        }
      }

      await commitLeadsToGitHub(updatedLeads, sha, `feat(leads): add/update ${toAdd.length} lead(s)`);

      return res.status(200).json({
        success: true,
        added: addedCount,
        total: updatedLeads.length
      });
    } catch (err) {
      console.error('POST /api/sync error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // DELETE: 删除指定线索
  if (req.method === 'DELETE') {
    try {
      const leadId = req.query?.id || (req.body && req.body.id);
      if (!leadId) {
        return res.status(400).json({ success: false, error: 'Missing lead id' });
      }

      const { leads: currentLeads, sha } = await fetchLeadsFromGitHub();
      const filtered = currentLeads.filter(l => l.id !== leadId);

      if (filtered.length !== currentLeads.length) {
        await commitLeadsToGitHub(filtered, sha, `feat(leads): delete lead ${leadId}`);
      }

      return res.status(200).json({ success: true, remaining: filtered.length });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method Not Allowed' });
};
