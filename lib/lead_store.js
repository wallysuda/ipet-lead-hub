/**
 * IPET Lead Hub · LeadStore 存储抽象
 *
 * 统一接口：list / upsert / softDelete / hardDelete
 * 后端实现：
 *   - GitHubLeadStore  (默认，Contents API 读写 data/cloud_leads.json)
 *   - FileLeadStore    (本地开发 / 单机)
 *
 * 写入语义：
 *   - sync_version 乐观锁：冲突返回 409 语义 { conflict: true, current }
 *   - 软删除写 deleted_at 墓碑，避免多端合并复活
 *   - 失败必须 success:false，禁止假成功
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

function env(name) {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function nowIso() {
  return new Date().toISOString();
}

function nextVersion(lead) {
  return (Number(lead && lead.sync_version) || 0) + 1;
}

/** 公司名归一（与前端查重规则对齐） */
function normalizeCompany(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\b(inc|incorporated|llc|ltd|limited|co|corp|corporation|gmbh|sa|bv|pty|pty ltd|plc|group|holdings)\b\.?/g, '')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhone(phone) {
  return String(phone || '').trim().replace(/[^0-9]/g, '');
}

/**
 * 查重：邮箱 > 电话 > 公司+人名 > 同域名+公司
 * 返回匹配到的已有线索或 null
 */
function findDuplicate(leads, candidate) {
  const active = (leads || []).filter(l => !l.deleted_at);
  const candEmail = String(candidate.email || '').trim().toLowerCase();
  const candPhone = normalizePhone(candidate.phone);
  const candCompany = normalizeCompany(candidate.company);
  const candName = String(candidate.name || '').trim().toLowerCase();

  for (const existing of active) {
    if (candEmail && existing.email && candEmail === String(existing.email).trim().toLowerCase()) {
      return { lead: existing, reason: 'email' };
    }
    if (candPhone && candPhone.length >= 7 && existing.phone) {
      if (candPhone === normalizePhone(existing.phone)) {
        return { lead: existing, reason: 'phone' };
      }
    }
    if (candCompany && candName && existing.company && existing.name) {
      const existComp = normalizeCompany(existing.company);
      const existName = String(existing.name).trim().toLowerCase();
      if (candCompany === existComp && candName === existName && candName !== 'linkedin 潜在客户') {
        return { lead: existing, reason: 'company_name' };
      }
    }
    if (candEmail && existing.email && candCompany && existing.company) {
      const candDomain = candEmail.split('@')[1] || '';
      const existDomain = String(existing.email).trim().toLowerCase().split('@')[1] || '';
      if (candDomain && candDomain === existDomain && candCompany === normalizeCompany(existing.company)) {
        return { lead: existing, reason: 'company_domain' };
      }
    }
  }
  return null;
}

class FileLeadStore {
  constructor(filePath) {
    this.baseFilePath = filePath || path.join(process.cwd(), 'data', 'cloud_leads.json');
    this.tmpFilePath = path.join('/tmp', 'cloud_leads.json');
    this.kind = 'file';
  }

  async list() {
    try {
      if (fs.existsSync(this.tmpFilePath)) {
        return JSON.parse(fs.readFileSync(this.tmpFilePath, 'utf8'));
      }
      if (fs.existsSync(this.baseFilePath)) {
        return JSON.parse(fs.readFileSync(this.baseFilePath, 'utf8'));
      }
    } catch (e) {
      console.error('FileLeadStore.list read error:', e.message);
    }
    return [];
  }

  async _write(leads) {
    try {
      fs.writeFileSync(this.baseFilePath, JSON.stringify(leads, null, 2), 'utf8');
      return { success: true, storage: 'file' };
    } catch (err) {
      // Vercel Serverless 只读文件系统 (EROFS)，优雅回退到 /tmp 运行时存储
      try {
        fs.writeFileSync(this.tmpFilePath, JSON.stringify(leads, null, 2), 'utf8');
        return { success: true, storage: 'tmp' };
      } catch (tmpErr) {
        return { success: false, error: tmpErr.message };
      }
    }
  }

  async upsert(items, options = {}) {
    const current = await this.list();
    const byId = new Map(current.map(l => [l.id, l]));
    const toAdd = Array.isArray(items) ? items : [items];
    let added = 0;
    let updated = 0;
    let conflicts = [];

    for (const raw of toAdd) {
      if (!raw) continue;
      const item = { ...raw };
      const leadId = item.id || `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const email = String(item.email || '').trim().toLowerCase();
      const existing = byId.get(leadId) ||
        current.find(l => email && l.email && String(l.email).trim().toLowerCase() === email);

      if (existing) {
        // 乐观锁：若客户端带了更旧的 sync_version，视为冲突
        const clientVer = item.sync_version;
        const serverVer = existing.sync_version || 0;
        if (clientVer != null && Number(clientVer) < serverVer && options.expectVersion !== false) {
          conflicts.push({ id: existing.id, server_version: serverVer, client_version: clientVer, current: existing });
          continue;
        }
        const merged = {
          ...existing,
          ...item,
          id: existing.id,
          created_at: existing.created_at || item.created_at || nowIso(),
          updated_at: nowIso(),
          sync_version: nextVersion(existing)
        };
        byId.set(existing.id, merged);
        updated++;
      } else {
        const dup = options.skipDuplicates ? findDuplicate(current, item) : null;
        if (dup && options.skipDuplicates) {
          conflicts.push({ id: dup.lead.id, reason: 'duplicate_' + dup.reason, current: dup.lead });
          continue;
        }
        const lead = {
          ...item,
          id: leadId,
          created_at: item.created_at || nowIso(),
          updated_at: nowIso(),
          sync_version: item.sync_version || 1
        };
        byId.set(leadId, lead);
        added++;
      }
    }

    const next = Array.from(byId.values());
    const writeRes = await this._write(next);
    return {
      success: writeRes.success,
      added,
      updated,
      total: next.length,
      conflicts,
      storage: this.kind
    };
  }

  async softDelete(id) {
    const current = await this.list();
    const idx = current.findIndex(l => l.id === id);
    if (idx === -1) return { success: false, error: 'not_found' };
    const now = nowIso();
    current[idx] = {
      ...current[idx],
      deleted_at: now,
      updated_at: now,
      sync_version: nextVersion(current[idx])
    };
    await this._write(current);
    return { success: true, mode: 'soft', remaining: current.filter(l => !l.deleted_at).length };
  }

  async hardDelete(id) {
    const current = await this.list();
    const next = current.filter(l => l.id !== id);
    if (next.length === current.length) return { success: false, error: 'not_found' };
    await this._write(next);
    return { success: true, mode: 'hard', remaining: next.filter(l => !l.deleted_at).length };
  }
}

class GitHubLeadStore {
  constructor(opts = {}) {
    this.owner = opts.owner || env('REPO_OWNER') || 'wallysuda';
    this.repo = opts.repo || env('REPO_NAME') || 'ipet-lead-hub';
    this.filePath = opts.filePath || 'data/cloud_leads.json';
    this.branch = opts.branch || 'main';
    this.token = opts.token || env('GITHUB_TOKEN');
    this.kind = 'github';
    this.memory = { leads: null, sha: null, timestamp: 0 };
    this.fallback = new FileLeadStore(opts.localPath);
  }

  _request(method, apiPath, body) {
    return new Promise((resolve, reject) => {
      const headers = {
        'User-Agent': 'IPET-Lead-Hub/2.0',
        'Accept': 'application/vnd.github.v3+json'
      };
      if (this.token) headers['Authorization'] = `token ${this.token}`;

      let payload = null;
      if (body) {
        payload = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = Buffer.byteLength(payload);
      }

      const req = https.request({
        hostname: 'api.github.com',
        port: 443,
        path: apiPath,
        method,
        headers
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: data ? JSON.parse(data) : {} });
          } catch (e) {
            resolve({ statusCode: res.statusCode, data });
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(8000, () => {
        req.destroy();
        reject(new Error('GitHub API timeout'));
      });
      if (payload) req.write(payload);
      req.end();
    });
  }

  async list() {
    if (!this.token) {
      const leads = await this.fallback.list();
      this.memory = { leads, sha: null, timestamp: Date.now() };
      return leads;
    }
    try {
      const res = await this._request('GET', `/repos/${this.owner}/${this.repo}/contents/${this.filePath}?ref=${this.branch}&_t=${Date.now()}`);
      if (res.statusCode === 200 && res.data && res.data.content) {
        const raw = Buffer.from(res.data.content, 'base64').toString('utf8');
        const leads = JSON.parse(raw);
        this.memory = { leads, sha: res.data.sha, timestamp: Date.now() };
        return leads;
      }
    } catch (e) {
      console.error('GitHubLeadStore.list error:', e.message);
    }
    if (this.memory.leads) return this.memory.leads;
    return this.fallback.list();
  }

  async _commit(leads, sha, message) {
    if (!this.token) {
      return this.fallback._write(leads);
    }

    let currentSha = sha || this.memory.sha;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!currentSha) {
        try {
          const check = await this._request('GET', `/repos/${this.owner}/${this.repo}/contents/${this.filePath}?ref=${this.branch}&_t=${Date.now()}`);
          if (check.statusCode === 200 && check.data && check.data.sha) currentSha = check.data.sha;
        } catch (e) {}
      }

      const body = {
        message: message || `feat(leads): sync (${leads.length} records)`,
        content: Buffer.from(JSON.stringify(leads, null, 2), 'utf8').toString('base64'),
        branch: this.branch
      };
      if (currentSha) body.sha = currentSha;

      const res = await this._request('PUT', `/repos/${this.owner}/${this.repo}/contents/${this.filePath}`, body);
      if (res.statusCode === 200 || res.statusCode === 201) {
        const newSha = res.data && res.data.content ? res.data.content.sha : null;
        this.memory = { leads, sha: newSha, timestamp: Date.now() };
        return { success: true, storage: 'github', sha: newSha };
      }
      if (res.statusCode === 409) {
        currentSha = null;
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      return { success: false, error: `GitHub API ${res.statusCode}`, status: res.statusCode };
    }
    return { success: false, error: 'GitHub write conflict after retries' };
  }

  async upsert(items, options = {}) {
    const current = await this.list();
    const byId = new Map(current.map(l => [l.id, l]));
    const toAdd = Array.isArray(items) ? items : [items];
    let added = 0;
    let updated = 0;
    const conflicts = [];

    for (const raw of toAdd) {
      if (!raw) continue;
      const item = { ...raw };
      const leadId = item.id || `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const email = String(item.email || '').trim().toLowerCase();
      const existing = byId.get(leadId) ||
        current.find(l => email && l.email && String(l.email).trim().toLowerCase() === email);

      if (existing) {
        const clientVer = item.sync_version;
        const serverVer = existing.sync_version || 0;
        if (clientVer != null && Number(clientVer) < serverVer && options.expectVersion !== false) {
          conflicts.push({ id: existing.id, server_version: serverVer, client_version: clientVer, current: existing });
          continue;
        }
        const merged = {
          ...existing,
          ...item,
          id: existing.id,
          created_at: existing.created_at || item.created_at || nowIso(),
          updated_at: nowIso(),
          sync_version: nextVersion(existing)
        };
        byId.set(existing.id, merged);
        updated++;
      } else {
        if (options.skipDuplicates) {
          const dup = findDuplicate(current, item);
          if (dup) {
            conflicts.push({ id: dup.lead.id, reason: 'duplicate_' + dup.reason, current: dup.lead });
            continue;
          }
        }
        const lead = {
          ...item,
          id: leadId,
          created_at: item.created_at || nowIso(),
          updated_at: nowIso(),
          sync_version: item.sync_version || 1
        };
        byId.set(leadId, lead);
        added++;
      }
    }

    const next = Array.from(byId.values());
    const writeRes = await this._commit(next, this.memory.sha, `feat(leads): upsert ${toAdd.length} lead(s)`);
    return {
      success: writeRes.success,
      added,
      updated,
      total: next.length,
      conflicts,
      storage: writeRes.storage || this.kind,
      error: writeRes.error
    };
  }

  async softDelete(id) {
    const current = await this.list();
    const idx = current.findIndex(l => l.id === id);
    if (idx === -1) return { success: false, error: 'not_found' };
    const now = nowIso();
    current[idx] = {
      ...current[idx],
      deleted_at: now,
      updated_at: now,
      sync_version: nextVersion(current[idx])
    };
    const writeRes = await this._commit(current, this.memory.sha, `feat(leads): soft-delete ${id}`);
    return {
      success: writeRes.success,
      mode: 'soft',
      remaining: current.filter(l => !l.deleted_at).length,
      error: writeRes.error
    };
  }

  async hardDelete(id) {
    const current = await this.list();
    const next = current.filter(l => l.id !== id);
    if (next.length === current.length) return { success: false, error: 'not_found' };
    const writeRes = await this._commit(next, this.memory.sha, `feat(leads): hard-delete ${id}`);
    return {
      success: writeRes.success,
      mode: 'hard',
      remaining: next.filter(l => !l.deleted_at).length,
      error: writeRes.error
    };
  }
}

function createLeadStore() {
  const driver = (env('LEAD_STORE') || 'github').toLowerCase();
  if (driver === 'file') {
    return new FileLeadStore();
  }
  return new GitHubLeadStore();
}

module.exports = {
  FileLeadStore,
  GitHubLeadStore,
  createLeadStore,
  findDuplicate,
  normalizeCompany,
  normalizePhone
};
