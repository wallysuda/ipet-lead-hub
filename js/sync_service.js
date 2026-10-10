/**
 * IPET LEAD ASSETS HUB · 本地与云端双向同步引擎 (SyncService)
 * 
 * 核心特性:
 * 1. 跨设备双向同步: 本地 LocalStorage 极速直出 + Vercel Serverless / GitHub 云端实时同步;
 * 2. 智能查重与防抖: 根据 邮箱 (email)、手机号 (phone)、公司 (company) 以及需求相似度自动比对;
 * 3. 健壮合并策略: 增量合并新旧线索，支持云端版本号与时间戳比对;
 * 4. 离线韧性机制: 无网络或无云端权限时平滑降级至本地离线存储，联网后自动重试同步。
 */

const STORAGE_KEY = 'IPET_LEAD_ASSETS_V1';
const SYNC_API_ENDPOINT = '/api/sync';

function hubAuthHeaders(extra = {}) {
  const token = (typeof window !== 'undefined' && window.IPET_HUB_TOKEN) ||
                (typeof localStorage !== 'undefined' && localStorage.getItem('IPET_HUB_TOKEN')) ||
                '';
  return token
    ? { ...extra, 'Authorization': `Bearer ${token}` }
    : { ...extra };
}

class SyncService {
  constructor() {
    this.leads = [];
    this.syncStatus = 'idle'; // 'idle' | 'syncing' | 'synced' | 'offline' | 'error'
    this.lastSyncTime = null;
    this.listeners = [];

    // 初始化加载
    this.init();
  }

  async init() {
    // 1. 先读本地
    this.loadFromLocal();

    // 2. 若本地无数据，尝试读取初始种子库 /data/initial_leads.json
    if (!this.leads || this.leads.length === 0) {
      await this.loadInitialSeed();
    }

    // 3. 异步尝试与云端对齐
    this.syncWithCloud().catch(err => {
      console.warn('[SyncService] Initial cloud sync warning:', err.message);
    });
  }

  // 注册数据变动监听器
  subscribe(fn) {
    if (typeof fn === 'function') {
      this.listeners.push(fn);
    }
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  notify() {
    this.listeners.forEach(fn => {
      try {
        fn(this.leads, this.syncStatus);
      } catch (e) {
        console.error('[SyncService] Listener error:', e);
      }
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ipet:leads_changed', {
        detail: { leads: this.leads, status: this.syncStatus }
      }));
    }
  }

  // 从 LocalStorage 加载（并自动进行强力去重）
  loadFromLocal() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          // 强力去重：同邮箱只保留信息最完整、得分最高的一条
          const seen = new Map();
          const clean = [];
          for (const item of list) {
            const em = (item.email || '').trim().toLowerCase();
            if (em) {
              if (seen.has(em)) {
                const prev = seen.get(em);
                const preferItem = (!prev.company && item.company) ||
                  ((item.jev_analysis?.maturity_score || 0) > (prev.jev_analysis?.maturity_score || 0));
                if (preferItem) {
                  const idx = clean.indexOf(prev);
                  clean[idx] = item;
                  seen.set(em, item);
                }
                continue;
              }
              seen.set(em, item);
            }
            clean.push(item);
          }
          this.leads = clean;
          this.saveToLocal();
        }
      }
    } catch (e) {
      console.error('[SyncService] Failed to load from localStorage:', e);
    }
  }

  // 保存至 LocalStorage
  saveToLocal() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.leads));
    } catch (e) {
      console.error('[SyncService] Failed to save to localStorage:', e);
    }
  }

  // 加载初始预置种子数据
  async loadInitialSeed() {
    try {
      if (typeof fetch !== 'undefined') {
        const res = await fetch('/data/initial_leads.json');
        if (res.ok) {
          const seeds = await res.json();
          if (Array.isArray(seeds) && seeds.length > 0) {
            this.leads = seeds;
            this.saveToLocal();
            this.notify();
          }
        }
      }
    } catch (e) {
      console.warn('[SyncService] Could not fetch initial_leads.json:', e.message);
    }
  }

  // 企业/公司名归一，便于查重（去后缀、去空白、小写）
  _normalizeCompany(name) {
    return (name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\b(inc|incorporated|llc|ltd|limited|co|corp|corporation|gmbh|sa|bv|pty|pty ltd|plc|group|holdings)\b\.?/g, '')
      .replace(/[.,]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  _normalizePhone(phone) {
    return (phone || '').trim().replace(/[^0-9]/g, '');
  }

  // 智能查重比对
  // 返回 { isDuplicate: boolean, matchedLead: object|null, reason: string }
  checkDuplicate(newLeadCandidate) {
    const active = (this.leads || []).filter(l => !l.deleted_at);
    if (active.length === 0) {
      return { isDuplicate: false, matchedLead: null, reason: '' };
    }

    const candEmail = (newLeadCandidate.email || '').trim().toLowerCase();
    const candPhone = this._normalizePhone(newLeadCandidate.phone);
    const candCompany = this._normalizeCompany(newLeadCandidate.company);
    const candName = (newLeadCandidate.name || '').trim().toLowerCase();

    for (const existing of active) {
      // 1. 邮箱精准匹配 (最权威)
      if (candEmail && existing.email && candEmail === existing.email.trim().toLowerCase()) {
        return {
          isDuplicate: true,
          matchedLead: existing,
          reason: `邮箱完全一致 (${existing.email})`
        };
      }

      // 2. 电话精准匹配 (去除分隔符后)
      if (candPhone && candPhone.length >= 7 && existing.phone) {
        const existPhone = this._normalizePhone(existing.phone);
        if (candPhone === existPhone) {
          return {
            isDuplicate: true,
            matchedLead: existing,
            reason: `联系电话完全一致 (${existing.phone})`
          };
        }
      }

      // 3. 同公司 + 相同人名 (高概率为同一个人多次提交不同表单)
      if (candCompany && candName && existing.company && existing.name) {
        const existComp = this._normalizeCompany(existing.company);
        const existName = (existing.name || '').trim().toLowerCase();
        if (candCompany === existComp && candName === existName && candName !== 'linkedin 潜在客户') {
          return {
            isDuplicate: true,
            matchedLead: existing,
            reason: `企业与客户姓名完全重合 (${existing.company} - ${existing.name})`
          };
        }
      }

      // 4. 同公司归一名 + 邮箱域名相同（同公司不同别名邮箱）
      if (candEmail && existing.email && candCompany && existing.company) {
        const candDomain = candEmail.split('@')[1] || '';
        const existEmail = existing.email.trim().toLowerCase();
        const existDomain = existEmail.split('@')[1] || '';
        const existComp = this._normalizeCompany(existing.company);
        if (candDomain && candDomain === existDomain && candCompany === existComp) {
          return {
            isDuplicate: true,
            matchedLead: existing,
            reason: `同公司邮箱域名一致 (${candDomain})`
          };
        }
      }
    }

    return { isDuplicate: false, matchedLead: null, reason: '' };
  }

  // 新增入库单条线索 (带 AI 意图判定与智能查重)
  async ingestLead(normalizedLead, options = { allowDuplicate: false }) {
    if (!normalizedLead) return { success: false, error: 'empty_lead' };
    const candEmail = (normalizedLead.email || '').trim().toLowerCase();

    // 0. 强去重：若已有同邮箱或同ID线索，永远智能合并，绝不创建两行重复数据
    const existingIndex = this.leads.findIndex(l => 
      (normalizedLead.id && l.id === normalizedLead.id) ||
      (candEmail && l.email && l.email.trim().toLowerCase() === candEmail)
    );

    if (existingIndex !== -1) {
      const existing = this.leads[existingIndex];
      const merged = {
        ...existing,
        ...normalizedLead,
        id: existing.id,
        name: existing.name && existing.name !== candEmail.split('@')[0] ? existing.name : (normalizedLead.name || existing.name),
        company: existing.company || normalizedLead.company || '',
        job_title: existing.job_title || normalizedLead.job_title || '',
        email_thread: [
          ...(existing.email_thread || []),
          ...((normalizedLead.email_thread || []).filter(nt => 
            !(existing.email_thread || []).some(et => et.snippet === nt.snippet && et.date === nt.date)
          ))
        ],
        updated_at: new Date().toISOString()
      };
      this.leads[existingIndex] = merged;
      this.saveToLocal();
      this.notify();
      return { success: true, duplicate: true, lead: merged };
    }

    // 1. 查重检验
    const dupCheck = this.checkDuplicate(normalizedLead);
    if (dupCheck.isDuplicate && !options.allowDuplicate) {
      return {
        success: false,
        duplicate: true,
        reason: dupCheck.reason,
        matchedLead: dupCheck.matchedLead
      };
    }

    // 2. 补充 UUID 与时间戳
    const lead = {
      id: normalizedLead.id || `lead_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      created_at: normalizedLead.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...normalizedLead
    };

    // 3. 若未附带 Jev 研判，则在前端动态触发研判
    if (!lead.jev_analysis && typeof window !== 'undefined' && window.jevEngine) {
      try {
        const text = lead.raw_requirements || lead.requirements || lead.raw_text || '';
        const jevRes = await window.jevEngine.scoreLeadIntent(text, lead.email, lead.company, lead.job_title);
        lead.jev_analysis = jevRes;
      } catch (e) {
        console.warn('[SyncService] Dynamic Jev scoring error:', e);
      }
    }

    // 4. 插入本地队列首位
    this.leads.unshift(lead);
    this.saveToLocal();
    this.notify();

    // 5. 异步推送到云端
    this.pushLeadToCloud(lead).catch(err => {
      console.warn('[SyncService] Cloud push warning:', err.message);
    });

    return {
      success: true,
      duplicate: false,
      lead: lead
    };
  }

  // 批量入库线索 (如 CSV 导入)
  async ingestBatch(normalizedLeads, options = { skipDuplicates: true }) {
    const results = {
      total: normalizedLeads.length,
      imported: 0,
      duplicates: 0,
      items: []
    };

    for (const candidate of normalizedLeads) {
      const dupCheck = this.checkDuplicate(candidate);
      if (dupCheck.isDuplicate) {
        results.duplicates++;
        if (options.skipDuplicates) {
          continue;
        }
      }

      const res = await this.ingestLead(candidate, { allowDuplicate: true });
      if (res.success) {
        results.imported++;
        results.items.push(res.lead);
      }
    }

    return results;
  }

  // 删除或作废线索（软删除墓碑，避免多端合并后复活）
  async deleteLead(leadId, options = { hard: false }) {
    const index = this.leads.findIndex(l => l.id === leadId);
    if (index === -1) return false;

    if (options.hard) {
      this.leads.splice(index, 1);
    } else {
      const now = new Date().toISOString();
      this.leads[index] = {
        ...this.leads[index],
        deleted_at: now,
        updated_at: now,
        sync_version: (this.leads[index].sync_version || 0) + 1
      };
    }
    this.saveToLocal();
    this.notify();

    // 云端同步删除（软删也推 deleted_at，便于其它设备对齐）
    try {
      if (typeof fetch !== 'undefined') {
        await fetch(`${SYNC_API_ENDPOINT}?id=${encodeURIComponent(leadId)}${options.hard ? '&hard=1' : ''}`, {
          method: 'DELETE',
          headers: hubAuthHeaders()
        });
      }
    } catch (e) {
      console.warn('[SyncService] Cloud delete sync error:', e);
    }

    return true;
  }

  // 与云端进行全量拉取与双向合并
  async syncWithCloud() {
    this.syncStatus = 'syncing';
    this.notify();

    try {
      if (typeof fetch === 'undefined') {
        this.syncStatus = 'offline';
        this.notify();
        return;
      }

      const res = await fetch(`${SYNC_API_ENDPOINT}?_t=${Date.now()}`, {
        headers: hubAuthHeaders()
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 503) {
          this.syncStatus = 'error';
          this.notify();
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('ipet:auth_required', {
              detail: { status: res.status }
            }));
          }
        }
        throw new Error(`Cloud sync HTTP ${res.status}`);
      }

      const cloudData = await res.json();
      const cloudLeads = Array.isArray(cloudData) ? cloudData : (cloudData.leads || []);

      if (Array.isArray(cloudLeads)) {
        // 双向合并策略：按 ID 与 Email 双重强去重，优先保留高分与完整记录
        const mergedMap = new Map();
        const emailToId = new Map();

        const addOrMerge = (lead) => {
          if (!lead) return;
          const email = (lead.email || '').trim().toLowerCase();
          if (email && emailToId.has(email)) {
            const existingId = emailToId.get(email);
            const existing = mergedMap.get(existingId);
            if (existing) {
              const preferNew = (!existing.company && lead.company) ||
                ((lead.jev_analysis?.maturity_score || 0) > (existing.jev_analysis?.maturity_score || 0));
              if (preferNew) {
                mergedMap.delete(existingId);
                mergedMap.set(lead.id, lead);
                emailToId.set(email, lead.id);
              }
              return;
            }
          }
          mergedMap.set(lead.id, lead);
          if (email) emailToId.set(email, lead.id);
        };

        this.leads.forEach(addOrMerge);
        cloudLeads.forEach(addOrMerge);

        // 转回数组并按时间倒序排列
        this.leads = Array.from(mergedMap.values()).sort((a, b) => {
          const tA = new Date(a.created_at || 0).getTime();
          const tB = new Date(b.created_at || 0).getTime();
          return tB - tA;
        });

        this.saveToLocal();
        this.lastSyncTime = new Date();
        this.syncStatus = 'synced';
        this.notify();
      }
    } catch (err) {
      console.warn('[SyncService] Cloud sync failed, staying offline:', err.message);
      this.syncStatus = 'offline';
      this.notify();
    }
  }

  // 推送单条线索至云端
  async pushLeadToCloud(lead) {
    if (typeof fetch === 'undefined') return;
    try {
      const res = await fetch(SYNC_API_ENDPOINT, {
        method: 'POST',
        headers: hubAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(lead)
      });
      if (res.ok) {
        this.syncStatus = 'synced';
        this.lastSyncTime = new Date();
        this.notify();
      } else if (res.status === 401 || res.status === 503) {
        this.syncStatus = 'error';
        this.notify();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('ipet:auth_required', {
            detail: { status: res.status }
          }));
        }
      }
    } catch (e) {
      console.warn('[SyncService] Push lead to cloud error:', e.message);
    }
  }

  // 获取所有线索（默认排除墓碑）
  getAllLeads(options = { includeDeleted: false }) {
    const all = this.leads || [];
    return options.includeDeleted ? all : all.filter(l => !l.deleted_at);
  }

  // 获取线索资产统计汇总
  getMetrics() {
    const all = (this.leads || []).filter(l => !l.deleted_at);
    let tier1Count = 0;
    let tier2Count = 0;
    let tier3Count = 0;
    let disqualifiedCount = 0;
    const channels = new Set();

    all.forEach(lead => {
      const tier = lead.jev_analysis?.tier || 'TIER_3_EXPLORATORY';
      if (tier === 'TIER_1_READY_RFQ') tier1Count++;
      else if (tier === 'TIER_2_TECH_SPEC') tier2Count++;
      else if (tier === 'DISQUALIFIED') disqualifiedCount++;
      else tier3Count++;

      const ch = lead.channel || lead.channel_source || '未知渠道';
      channels.add(ch);
    });

    return {
      total: all.length,
      tier1: tier1Count,
      tier2: tier2Count,
      tier3: tier3Count,
      disqualified: disqualifiedCount,
      channelsCount: channels.size,
      channelsList: Array.from(channels)
    };
  }

  // 保存与更新所有线索资产
  saveLeads(leads) {
    this.leads = leads;
    this.saveToLocal();
    this.notify();
  }

  // 清空本地导入线索并重置为初始种子
  async clearCustomLeads() {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    this.leads = [];
    await this.loadInitialSeed();
    this.notify();
  }
}

// 挂载全局与模块导出
if (typeof window !== 'undefined') {
  window.syncService = new SyncService();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SyncService;
}
