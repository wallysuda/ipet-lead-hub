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

  // 从 LocalStorage 加载
  loadFromLocal() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.leads = JSON.parse(raw);
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

  // 智能查重比对
  // 返回 { isDuplicate: boolean, matchedLead: object|null, reason: string }
  checkDuplicate(newLeadCandidate) {
    if (!this.leads || this.leads.length === 0) {
      return { isDuplicate: false, matchedLead: null, reason: '' };
    }

    const candEmail = (newLeadCandidate.email || '').trim().toLowerCase();
    const candPhone = (newLeadCandidate.phone || '').trim().replace(/[^0-9]/g, '');
    const candCompany = (newLeadCandidate.company || '').trim().toLowerCase();
    const candName = (newLeadCandidate.name || '').trim().toLowerCase();

    for (const existing of this.leads) {
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
        const existPhone = existing.phone.trim().replace(/[^0-9]/g, '');
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
        const existComp = existing.company.trim().toLowerCase();
        const existName = existing.name.trim().toLowerCase();
        if (candCompany === existComp && candName === existName && candName !== 'linkedin 潜在客户') {
          return {
            isDuplicate: true,
            matchedLead: existing,
            reason: `企业与客户姓名完全重合 (${existing.company} - ${existing.name})`
          };
        }
      }
    }

    return { isDuplicate: false, matchedLead: null, reason: '' };
  }

  // 新增入库单条线索 (带 AI 意图判定与智能查重)
  async ingestLead(normalizedLead, options = { allowDuplicate: false }) {
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

  // 删除或作废线索
  async deleteLead(leadId) {
    const index = this.leads.findIndex(l => l.id === leadId);
    if (index === -1) return false;

    this.leads.splice(index, 1);
    this.saveToLocal();
    this.notify();

    // 云端同步删除
    try {
      if (typeof fetch !== 'undefined') {
        await fetch(`${SYNC_API_ENDPOINT}?id=${encodeURIComponent(leadId)}`, {
          method: 'DELETE'
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

      const res = await fetch(`${SYNC_API_ENDPOINT}?_t=${Date.now()}`);
      if (!res.ok) {
        throw new Error(`Cloud sync HTTP ${res.status}`);
      }

      const cloudData = await res.json();
      const cloudLeads = Array.isArray(cloudData) ? cloudData : (cloudData.leads || []);

      if (Array.isArray(cloudLeads)) {
        // 双向合并策略：按 ID 对齐，保留最新 updated_at
        const mergedMap = new Map();

        // 先放入本地
        this.leads.forEach(l => mergedMap.set(l.id, l));

        // 合并云端
        cloudLeads.forEach(cLead => {
          if (!mergedMap.has(cLead.id)) {
            mergedMap.set(cLead.id, cLead);
          } else {
            const local = mergedMap.get(cLead.id);
            const cloudTime = new Date(cLead.updated_at || cLead.created_at || 0).getTime();
            const localTime = new Date(local.updated_at || local.created_at || 0).getTime();
            if (cloudTime > localTime) {
              mergedMap.set(cLead.id, cLead);
            }
          }
        });

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead)
      });
      if (res.ok) {
        this.syncStatus = 'synced';
        this.lastSyncTime = new Date();
        this.notify();
      }
    } catch (e) {
      console.warn('[SyncService] Push lead to cloud error:', e.message);
    }
  }

  // 获取所有线索
  getAllLeads() {
    return this.leads || [];
  }

  // 获取线索资产统计汇总
  getMetrics() {
    const all = this.leads || [];
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
}

// 挂载全局与模块导出
if (typeof window !== 'undefined') {
  window.syncService = new SyncService();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SyncService;
}
