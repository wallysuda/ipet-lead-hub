/**
 * IPET LEAD ASSETS HUB · 前端主控制器 (App Controller)
 * 零图标/零 Emoji 规范 · 北美工业级硬件工程风格
 */

(function () {
  'use strict';

  // 全局状态
  let currentFilteredLeads = [];
  let currentEmailLead = null;
  let currentEmailAnalysis = null;
  let selectedStrategyId = null;
  let selectedSubjectText = '';
  let selectedEmailLength = 'short';
  let selectedLeadIds = new Set();

  // DOM 元素引用
  const el = {
    cloudSyncStatus: document.getElementById('cloudSyncStatus'),
    btnSyncNow: document.getElementById('btnSyncNow'),
    leadCsvFileInput: document.getElementById('leadCsvFileInput'),
    btnImportCsv: document.getElementById('btnImportCsv'),
    btnFocusPaste: document.getElementById('btnFocusPaste'),
    btnClearCustom: document.getElementById('btnClearCustom'),

    // 快捷粘贴卡片
    pasteLeadInput: document.getElementById('pasteLeadInput'),
    pasteSyncIndicator: document.getElementById('pasteSyncIndicator'),
    btnPasteLead: document.getElementById('btnPasteLead'),
    btnPasteConfirm: document.getElementById('btnPasteConfirm'),
    btnPasteCancel: document.getElementById('btnPasteCancel'),
    pastePreview: document.getElementById('pastePreview'),
    pastePreviewGrid: document.getElementById('pastePreviewGrid'),

    // 数据状态与全量研判控制条
    leadCountNumber: document.getElementById('leadCountNumber'),
    reevaluateStatus: document.getElementById('reevaluateStatus'),
    btnReevaluateAllJev: document.getElementById('btnReevaluateAllJev'),

    // 10 列表格
    leadsTableBody: document.getElementById('leadsTableBody'),

    // Email Modal
    modalEmail: document.getElementById('modalEmail'),
    emailModalClientTitle: document.getElementById('emailModalClientTitle'),
    emailModalClientSub: document.getElementById('emailModalClientSub'),
    emailModalPersonaBadge: document.getElementById('emailModalPersonaBadge'),
    emailStrategyCards: document.getElementById('emailStrategyCards'),
    emailSubjectList: document.getElementById('emailSubjectList'),
    emailBodyTextarea: document.getElementById('emailBodyTextarea'),
    btnCopyEmail: document.getElementById('btnCopyEmail'),
    btnOpenMailto: document.getElementById('btnOpenMailto'),
    btnMarkPass: document.getElementById('btnMarkPass'),
    btnMarkFollowed: document.getElementById('btnMarkFollowed'),

    // Toasts
    toastContainer: document.getElementById('toastContainer'),

    // Access token
    authBar: document.getElementById('authBar'),
    hubTokenInput: document.getElementById('hubTokenInput'),
    btnSaveHubToken: document.getElementById('btnSaveHubToken'),
    btnSkipHubToken: document.getElementById('btnSkipHubToken'),

    // Toolbar
    leadSearchInput: document.getElementById('leadSearchInput'),
    leadTierFilter: document.getElementById('leadTierFilter'),
    leadSortSelect: document.getElementById('leadSortSelect'),
    btnExportCsv: document.getElementById('btnExportCsv'),
    btnMailSync: document.getElementById('btnMailSync'),
    btnMailSyncInModal: document.getElementById('btnMailSyncInModal'),
    btnReplyManual: document.getElementById('btnReplyManual'),
    replyList: document.getElementById('replyList'),
    replyCount: document.getElementById('replyCount'),
    btnCopyEnrollLink: document.getElementById('btnCopyEnrollLink'),

    // Batch + funnel
    batchBar: document.getElementById('batchBar'),
    batchSelectedCount: document.getElementById('batchSelectedCount'),
    btnBatchRescore: document.getElementById('btnBatchRescore'),
    btnBatchMarkFollowed: document.getElementById('btnBatchMarkFollowed'),
    btnBatchExport: document.getElementById('btnBatchExport'),
    btnBatchSoftDelete: document.getElementById('btnBatchSoftDelete'),
    btnSelectAll: document.getElementById('btnSelectAll'),
    selectAllCheckbox: document.getElementById('selectAllCheckbox'),
    funnelTotal: document.getElementById('funnelTotal'),
    funnelT1: document.getElementById('funnelT1'),
    funnelT2: document.getElementById('funnelT2'),
    funnelT3: document.getElementById('funnelT3'),
    funnelOther: document.getElementById('funnelOther'),
    funnelEmailed: document.getElementById('funnelEmailed'),
    funnelFollowed: document.getElementById('funnelFollowed'),
    funnelPassed: document.getElementById('funnelPassed'),

    // Enrichment
    enrichPanel: document.getElementById('enrichPanel'),
    enrichConfidence: document.getElementById('enrichConfidence'),
    enrichManualBadge: document.getElementById('enrichManualBadge'),
    btnEnrichNow: document.getElementById('btnEnrichNow'),
    btnEnrichReset: document.getElementById('btnEnrichReset'),
    btnEnrichSave: document.getElementById('btnEnrichSave'),
    enrichCompany: document.getElementById('enrichCompany'),
    enrichWebsite: document.getElementById('enrichWebsite'),
    enrichIndustry: document.getElementById('enrichIndustry'),
    enrichTarget: document.getElementById('enrichTarget'),
    enrichSummary: document.getElementById('enrichSummary'),
    enrichNote: document.getElementById('enrichNote'),
    enrichSources: document.getElementById('enrichSources'),
    enrichNoteBox: document.getElementById('enrichNoteBox'),
    btnRunAiAnalyze: document.getElementById('btnRunAiAnalyze'),
    aiAnalyzeStatus: document.getElementById('aiAnalyzeStatus')
  };

  function updateBatchBar() {
    const n = selectedLeadIds.size;
    if (el.batchSelectedCount) el.batchSelectedCount.textContent = String(n);
    if (el.batchBar) {
      if (n > 0) el.batchBar.classList.add('active');
      else el.batchBar.classList.remove('active');
    }
  }

  function updateFunnel(leads) {
    const list = (leads || []).filter(l => !l.deleted_at);
    const grades = list.map(l => resolveIntentGrade(l));
    const count = (codes) => grades.filter(g => codes.includes(g.code)).length;
    const g5 = count(['G5_RRFQ']);
    const g4 = count(['G4_SPEC']);
    const g3 = count(['G3_NURTURE']);
    const other = count(['G0_PASS', 'G1_DECLINE', 'G2_SUPPLIER']);

    // 已出邮件草稿：生成过邮件正文（打开工作台出稿）
    const drafted = list.filter(l => l.email_generated_at || l.draft_generated_at || l.status === 'emailed').length;
    // 已跟进：复制/发送后点「已跟进」，或批量标记
    const followed = list.filter(l => l.status === 'followed_up' || l.followed_up_at).length;
    // 已 Pass 归档
    const passed = list.filter(l => l.status === 'passed' || l.passed_at).length;

    if (el.funnelTotal) el.funnelTotal.textContent = String(list.length);
    if (el.funnelT1) el.funnelT1.textContent = String(g5);
    if (el.funnelT2) el.funnelT2.textContent = String(g4);
    if (el.funnelT3) el.funnelT3.textContent = String(g3);
    if (el.funnelOther) el.funnelOther.textContent = String(other);
    if (el.funnelEmailed) el.funnelEmailed.textContent = String(drafted);
    if (el.funnelFollowed) el.funnelFollowed.textContent = String(followed);
    if (el.funnelPassed) el.funnelPassed.textContent = String(passed);
  }

  /** 统一取 G0–G5（缓存到 lead 上，避免反复重算） */
  function resolveIntentGrade(lead) {
    if (!lead) return { code: 'G3_NURTURE', label: 'G3 培育 · 补参跟进', short: '培育', badge: 'warn', maturity: 0 };
    if (lead._intent_grade && lead._intent_grade_at === lead.updated_at) {
      return lead._intent_grade;
    }
    let grade;
    try {
      if (window.InquiryResponder && window.InquiryResponder.classifyIntent) {
        grade = window.InquiryResponder.classifyIntent(lead);
      }
    } catch (e) {}
    if (!grade) {
      const ja = lead.jev_analysis || {};
      const t = ja.tier || '';
      grade = {
        code: t === 'TIER_1_READY_RFQ' ? 'G5_RRFQ' : t === 'TIER_2_TECH_SPEC' ? 'G4_SPEC' : t === 'DISQUALIFIED' ? 'G0_PASS' : 'G3_NURTURE',
        label: t === 'TIER_1_READY_RFQ' ? 'G5 热商机 · RFQ' : t === 'TIER_2_TECH_SPEC' ? 'G4 资料 · 规格推进' : t === 'DISQUALIFIED' ? 'G0 无效 · Pass' : 'G3 培育 · 补参跟进',
        short: '—',
        badge: t === 'TIER_1_READY_RFQ' ? 'success' : t === 'TIER_2_TECH_SPEC' ? 'info' : t === 'DISQUALIFIED' ? 'crit' : 'warn',
        maturity: ja.maturity_score || 0
      };
    }
    lead._intent_grade = grade;
    lead._intent_grade_at = lead.updated_at;
    return grade;
  }

  function getSelectedLeads() {
    const all = window.syncService ? window.syncService.getAllLeads() : [];
    return all.filter(l => selectedLeadIds.has(l.id));
  }

  function persistLeadMutation(lead) {
    if (!window.syncService) return;
    lead.updated_at = new Date().toISOString();
    lead.sync_version = (lead.sync_version || 0) + 1;
    // 保存全量（本地立即可见）；云端由 syncService 的 push 异步对齐
    const all = window.syncService.getAllLeads({ includeDeleted: true });
    // getAllLeads 默认滤墓碑，这里直接改内部数组
    const raw = window.syncService.leads || all;
    const idx = raw.findIndex(l => l.id === lead.id);
    if (idx >= 0) raw[idx] = lead;
    window.syncService.saveLeads(raw);
    if (window.syncService.pushLeadToCloud) {
      window.syncService.pushLeadToCloud(lead).catch(() => {});
    }
  }

  function applyLeadFilters(leads) {
    const q = (el.leadSearchInput && el.leadSearchInput.value || '').trim().toLowerCase();
    const tier = el.leadTierFilter && el.leadTierFilter.value || '';
    const sort = el.leadSortSelect && el.leadSortSelect.value || 'time_desc';

    let list = (leads || []).slice();
    if (tier) {
      list = list.filter(l => {
        const g = resolveIntentGrade(l);
        if (g.code === tier) return true;
        // 兼容旧 Tier 筛选
        return (l.jev_analysis && l.jev_analysis.tier) === tier;
      });
    }
    if (q) {
      list = list.filter(l => {
        const blob = [
          l.name, l.email, l.company, l.job_title,
          l.raw_requirements, l.raw_text, l.channel_source, l.channel_scenario
        ].join(' ').toLowerCase();
        return blob.includes(q);
      });
    }

    const timeOf = l => new Date(l.submitted_at || l.created_at || 0).getTime();
    const scoreOf = l => (l.jev_analysis && l.jev_analysis.maturity_score) || 0;

    if (sort === 'time_desc') list.sort((a, b) => timeOf(b) - timeOf(a));
    else if (sort === 'time_asc') list.sort((a, b) => timeOf(a) - timeOf(b));
    else if (sort === 'score_desc') list.sort((a, b) => scoreOf(b) - scoreOf(a));
    else if (sort === 'score_asc') list.sort((a, b) => scoreOf(a) - scoreOf(b));
    else if (sort === 'company_asc') list.sort((a, b) => String(a.company || '').localeCompare(String(b.company || '')));

    return list;
  }

  function refreshVisibleTable() {
    const all = window.syncService ? window.syncService.getAllLeads() : currentFilteredLeads;
    const view = applyLeadFilters(all);
    currentFilteredLeads = view;
    renderTable(view);
    if (el.leadCountNumber) {
      el.leadCountNumber.textContent = String(view.length);
    }
    updateFunnel(all);
  }

  function exportLeadsCsv() {
    const rows = currentFilteredLeads.length ? currentFilteredLeads : (window.syncService ? window.syncService.getAllLeads() : []);
    if (!rows.length) {
      showToast('当前没有可导出的线索', 'warn');
      return;
    }
    const headers = [
      '提交时间', '客户姓名', '企业邮箱', '企业', '职位', '电话', '国家',
      '线索来源', '获客场景', '需求摘要', '商机分级', '成熟度评分', '跟进策略', 'ID'
    ];
    const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = [headers.map(esc).join(',')];
    rows.forEach(l => {
      const ja = l.jev_analysis || {};
      lines.push([
        l.submitted_at || l.created_at || '',
        l.name || '',
        l.email || '',
        l.company || '',
        l.job_title || '',
        l.phone || '',
        l.country || '',
        l.channel_source || '',
        l.channel_scenario || '',
        (l.analysis_brief || l.raw_requirements || '').replace(/\s+/g, ' ').slice(0, 200),
        ja.tier || '',
        ja.maturity_score != null ? ja.maturity_score : '',
        (ja.recommended_action || '').replace(/\s+/g, ' ').slice(0, 160),
        l.id || ''
      ].map(esc).join(','));
    });
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0, 10);
    a.href = URL.createObjectURL(blob);
    a.download = `ipet-leads-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast(`已导出 ${rows.length} 条线索`, 'success');
  }

  // ========== 客户回复闭环 ==========
  function authHeaders(extra = {}) {
    const token = (typeof window !== 'undefined' && window.IPET_HUB_TOKEN) ||
                  (typeof localStorage !== 'undefined' && localStorage.getItem('IPET_HUB_TOKEN')) ||
                  '';
    return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
  }

  function renderReplies(lead) {
    if (!el.replyList) return;
    const thread = (lead && lead.email_thread) || [];
    if (el.replyCount) el.replyCount.textContent = thread.length + ' 条';
    if (!thread.length) {
      el.replyList.innerHTML = '暂无客户回复记录。仅显示匹配到本线索的回复摘要（非整个收件箱）。';
      return;
    }
    el.replyList.innerHTML = thread.slice().reverse().map(r => `
      <div class="reply-item">
        <div class="meta">${escapeHtml(r.date || '')} · ${escapeHtml(r.from || '')} · ${escapeHtml(r.source || 'imap')}</div>
        <div>${escapeHtml(r.snippet || String(r.body || '').slice(0, 160))}</div>
      </div>
    `).join('');
  }

  async function syncMailReplies() {
    try {
      if (el.btnMailSync) el.btnMailSync.disabled = true;
      showToast('正在从企业邮拉取客户回复...', 'info');
      const res = await fetch('/api/mail', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'sync' })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || ('HTTP ' + res.status));
      }
      showToast(`收信完成：匹配 ${data.matched || 0} 条，更新 ${data.updated || 0} 条线索`, 'success');
      if (window.syncService) await window.syncService.syncWithCloud();
      refreshVisibleTable();
      if (currentEmailLead) {
        const fresh = (window.syncService.getAllLeads() || []).find(l => l.id === currentEmailLead.id) || currentEmailLead;
        currentEmailLead = fresh;
        renderReplies(fresh);
      }
    } catch (e) {
      showToast('收信失败: ' + e.message, 'error');
    } finally {
      if (el.btnMailSync) el.btnMailSync.disabled = false;
    }
  }

  function bindMailEvents() {
    if (el.btnMailSync) el.btnMailSync.addEventListener('click', syncMailReplies);
    if (el.btnMailSyncInModal) el.btnMailSyncInModal.addEventListener('click', syncMailReplies);
    if (el.btnReplyManual) {
      el.btnReplyManual.addEventListener('click', async () => {
        if (!currentEmailLead) return;
        const text = prompt('粘贴客户回复正文（将记入该线索）');
        if (!text || !text.trim()) return;
        try {
          const res = await fetch('/api/mail', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              lead_id: currentEmailLead.id,
              reply_text: text.trim(),
              reply_from: currentEmailLead.email || 'manual'
            })
          });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.error || 'save failed');
          showToast('已记入客户回复', 'success');
          if (window.syncService) await window.syncService.syncWithCloud();
          const fresh = (window.syncService.getAllLeads() || []).find(l => l.id === currentEmailLead.id);
          if (fresh) {
            currentEmailLead = fresh;
            renderReplies(fresh);
          }
          refreshVisibleTable();
        } catch (e) {
          showToast('记录失败: ' + e.message, 'error');
        }
      });
    }
  }

  function bindToolbarEvents() {
    const onChange = () => refreshVisibleTable();
    if (el.leadSearchInput) el.leadSearchInput.addEventListener('input', onChange);
    if (el.leadTierFilter) el.leadTierFilter.addEventListener('change', onChange);
    if (el.leadSortSelect) el.leadSortSelect.addEventListener('change', onChange);
    if (el.btnExportCsv) el.btnExportCsv.addEventListener('click', exportLeadsCsv);
  }

  function bindBatchEvents() {
    if (el.btnSelectAll) {
      el.btnSelectAll.addEventListener('click', () => {
        if (selectedLeadIds.size > 0) {
          selectedLeadIds.clear();
        } else {
          currentFilteredLeads.forEach(l => selectedLeadIds.add(l.id));
        }
        refreshVisibleTable();
        updateBatchBar();
      });
    }
    if (el.selectAllCheckbox) {
      el.selectAllCheckbox.addEventListener('change', () => {
        if (el.selectAllCheckbox.checked) {
          currentFilteredLeads.forEach(l => selectedLeadIds.add(l.id));
        } else {
          selectedLeadIds.clear();
        }
        refreshVisibleTable();
        updateBatchBar();
      });
    }

    if (el.btnBatchExport) {
      el.btnBatchExport.addEventListener('click', () => {
        const picked = getSelectedLeads();
        if (!picked.length) {
          showToast('请先勾选线索', 'warn');
          return;
        }
        const prev = currentFilteredLeads;
        currentFilteredLeads = picked;
        exportLeadsCsv();
        currentFilteredLeads = prev;
      });
    }

    if (el.btnBatchMarkFollowed) {
      el.btnBatchMarkFollowed.addEventListener('click', () => {
        const picked = getSelectedLeads();
        if (!picked.length) {
          showToast('请先勾选线索', 'warn');
          return;
        }
        const ts = new Date().toISOString();
        picked.forEach(l => {
          l.status = 'followed_up';
          l.followed_up_at = ts;
          persistLeadMutation(l);
        });
        showToast(`已标记 ${picked.length} 条为已跟进`, 'success');
        refreshVisibleTable();
      });
    }

    if (el.btnBatchSoftDelete) {
      el.btnBatchSoftDelete.addEventListener('click', async () => {
        const picked = getSelectedLeads();
        if (!picked.length) {
          showToast('请先勾选线索', 'warn');
          return;
        }
        if (!confirm(`确认软删除 ${picked.length} 条线索？（可恢复）`)) return;
        for (const l of picked) {
          if (window.syncService && window.syncService.deleteLead) {
            await window.syncService.deleteLead(l.id);
          }
        }
        selectedLeadIds.clear();
        showToast(`已软删除 ${picked.length} 条`, 'success');
        updateBatchBar();
        refreshVisibleTable();
      });
    }

    if (el.btnBatchRescore) {
      el.btnBatchRescore.addEventListener('click', async () => {
        const picked = getSelectedLeads();
        if (!picked.length) {
          showToast('请先勾选线索', 'warn');
          return;
        }
        if (!window.jevEngine) return;
        el.btnBatchRescore.disabled = true;
        try {
          for (const lead of picked) {
            const promptText = (lead.raw_requirements || lead.raw_text || '') + ' ' + JSON.stringify(lead.fields_filled || {});
            const jevRes = await window.jevEngine.scoreLeadIntent(promptText, lead.email, lead.company, lead.job_title);
            if (jevRes) {
              lead.jev_analysis = { ...lead.jev_analysis, ...jevRes, rescored_at: new Date().toISOString() };
              persistLeadMutation(lead);
            }
          }
          showToast(`已重新研判 ${picked.length} 条`, 'success');
          refreshVisibleTable();
        } catch (e) {
          showToast('批量研判失败: ' + e.message, 'error');
        } finally {
          el.btnBatchRescore.disabled = false;
        }
      });
    }
  }

  function getHubToken() {
    try {
      return localStorage.getItem('IPET_HUB_TOKEN') || '';
    } catch (e) {
      return '';
    }
  }

  function setHubToken(token) {
    try {
      if (token) {
        localStorage.setItem('IPET_HUB_TOKEN', token);
        window.IPET_HUB_TOKEN = token;
      } else {
        localStorage.removeItem('IPET_HUB_TOKEN');
        window.IPET_HUB_TOKEN = '';
      }
    } catch (e) {}
  }

  function showAuthBar(show) {
    if (!el.authBar) return;
    if (show) el.authBar.removeAttribute('hidden');
    else el.authBar.setAttribute('hidden', '');
  }

  /**
   * 一键开通链接：https://site/#t=TOKEN
   * 打开后自动写入 localStorage 并清掉 hash，避免令牌进服务端日志。
   */
  function tryEnrollFromUrl() {
    try {
      const hash = window.location.hash || '';
      const m = hash.match(/[#&](?:t|token|enroll)=([^&]+)/i);
      if (!m) return false;
      const token = decodeURIComponent(m[1]).trim();
      if (!token) return false;
      setHubToken(token);
      // 立刻清掉地址栏中的令牌
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } else {
        window.location.hash = '';
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function buildEnrollLink() {
    const token = getHubToken();
    if (!token) return '';
    return `${window.location.origin}${window.location.pathname}#t=${encodeURIComponent(token)}`;
  }

  // ========== 自动背调（可人工修正） ==========
  function enrichAuthHeaders(extra = {}) {
    const token = (typeof window !== 'undefined' && window.IPET_HUB_TOKEN) ||
                  (typeof localStorage !== 'undefined' && localStorage.getItem('IPET_HUB_TOKEN')) ||
                  '';
    return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
  }

  async function runEnrichment(lead, options = { silent: false }) {
    if (!lead) return null;
    if (el.btnEnrichNow) el.btnEnrichNow.disabled = true;
    if (!options.silent && el.enrichNoteBox) {
      el.enrichNoteBox.textContent = '正在抓取公开网页信号（官网 / 搜索摘要）…';
    }
    try {
      const res = await fetch('/api/enrich', {
        method: 'POST',
        headers: enrichAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          company: lead.company || '',
          email: lead.email || '',
          name: lead.name || '',
          job_title: lead.job_title || '',
          text: (lead.raw_requirements || lead.raw_text || '')
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      lead.enrichment = data.enrichment;
      lead.enrichment_at = data.enrichment.researched_at;
      // 自动结果不覆盖人工修正
      if (!lead.enrichment_manual) {
        lead.enrichment_auto = data.enrichment;
      }
      persistLeadMutation(lead);
      renderEnrichment(lead);
    renderReplies(lead);
      if (!options.silent) showToast('自动背调完成，可核对后保存修正', 'success');
      return data.enrichment;
    } catch (e) {
      console.warn('enrich failed', e);
      if (!options.silent) showToast('自动背调失败: ' + e.message, 'error');
      if (el.enrichNoteBox) {
        el.enrichNoteBox.textContent = '自动背调失败或超时。可手动填写行业/官网后保存修正，不影响后续分析。';
      }
      return null;
    } finally {
      if (el.btnEnrichNow) el.btnEnrichNow.disabled = false;
    }
  }

  function sanitizeWebsiteUrl(url) {
    if (!url) return '';
    const s = String(url).toLowerCase().trim();
    if (
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
    ) {
      return '';
    }
    return url;
  }

  function currentEnrichView(lead) {
    const auto = lead.enrichment || lead.enrichment_auto || {};
    const manual = lead.enrichment_manual || {};
    return {
      company: manual.company || lead.company || auto.query_company || '',
      website: sanitizeWebsiteUrl(manual.website || (auto.website && auto.website.url) || ''),
      industry: manual.industry || (auto.industry_guess || []).join(' / ') || '',
      target: manual.target != null && manual.target !== ''
        ? manual.target
        : (auto.is_likely_target === true ? 'yes' : auto.is_likely_target === false ? 'no' : ''),
      summary: manual.summary || auto.search?.abstract || auto.website?.description || auto.website?.title || '',
      note: manual.note || '',
      confidence: auto.confidence || 'low',
      is_manual: !!lead.enrichment_manual,
      sources: auto.sources || [],
      notes: auto.notes || []
    };
  }

  function renderEnrichment(lead) {
    if (!lead || !el.enrichPanel) return;
    const v = currentEnrichView(lead);

    if (el.enrichCompany) el.enrichCompany.value = v.company || '';
    if (el.enrichWebsite) el.enrichWebsite.value = v.website || '';
    if (el.enrichIndustry) el.enrichIndustry.value = v.industry || '';
    if (el.enrichTarget) el.enrichTarget.value = v.target || '';
    if (el.enrichSummary) el.enrichSummary.value = v.summary || '';
    if (el.enrichNote) el.enrichNote.value = v.note || '';

    if (el.enrichConfidence) {
      const conf = v.is_manual ? 'high' : (v.confidence || 'low');
      el.enrichConfidence.className = `enrich-badge ${conf}`;
      el.enrichConfidence.textContent = v.is_manual
        ? '已人工校准'
        : ({ high: '背调高置信', medium: '背调中置信', low: '背调低置信' }[conf] || '未背调');
    }
    if (el.enrichManualBadge) {
      if (v.is_manual) el.enrichManualBadge.removeAttribute('hidden');
      else el.enrichManualBadge.setAttribute('hidden', '');
    }

    if (el.enrichSources) {
      const parts = [];
      (v.sources || []).forEach((s, i) => {
        const label = s.label || s.url || `来源${i + 1}`;
        parts.push(s.url ? `<a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>` : escapeHtml(label));
      });
      (v.notes || []).forEach(n => parts.push(escapeHtml(n)));
      el.enrichSources.innerHTML = parts.length ? parts.join(' · ') : '暂无公开信号（可手动填写）';
    }

    if (el.enrichNoteBox) {
      el.enrichNoteBox.textContent = v.is_manual
        ? '已启用人工修正。改字段后点「保存修正」会覆盖分析/邮件用词；点「恢复自动」可退回自动结果。'
        : '自动背调可能出错：可直接改字段后「保存修正」。修正会覆盖分析与邮件用词，并标记「已人工修正」。';
    }
  }

  function saveEnrichmentFromForm(lead) {
    if (!lead) return null;
    const manual = {
      company: (el.enrichCompany && el.enrichCompany.value || '').trim(),
      website: (el.enrichWebsite && el.enrichWebsite.value || '').trim(),
      industry: (el.enrichIndustry && el.enrichIndustry.value || '').trim(),
      target: (el.enrichTarget && el.enrichTarget.value) || '',
      summary: (el.enrichSummary && el.enrichSummary.value || '').trim(),
      note: (el.enrichNote && el.enrichNote.value || '').trim(),
      saved_at: new Date().toISOString()
    };
    lead.enrichment_manual = manual;
    if (manual.company) lead.company = manual.company;
    // 供研判/邮件使用的目标客群覆盖
    lead.enrichment_override = {
      is_likely_target: manual.target === 'yes' ? true : manual.target === 'no' ? false : null,
      industry: manual.industry,
      website: manual.website
    };
    persistLeadMutation(lead);
    renderEnrichment(lead);
    showToast('背调修正已保存，并覆盖后续分析', 'success');
    return manual;
  }

  function bindEnrichEvents() {
    if (el.btnEnrichNow) {
      el.btnEnrichNow.addEventListener('click', async () => {
        if (!currentEmailLead) return;
        await runEnrichment(currentEmailLead);
      });
    }
    if (el.btnEnrichSave) {
      el.btnEnrichSave.addEventListener('click', () => {
        if (!currentEmailLead) return;
        saveEnrichmentFromForm(currentEmailLead);
      });
    }
    if (el.btnEnrichReset) {
      el.btnEnrichReset.addEventListener('click', () => {
        if (!currentEmailLead) return;
        delete currentEmailLead.enrichment_manual;
        delete currentEmailLead.enrichment_override;
        persistLeadMutation(currentEmailLead);
        renderEnrichment(currentEmailLead);
        showToast('已恢复自动背调结果', 'info');
      });
    }
  }

  function bindAuthEvents() {
    if (el.btnSaveHubToken) {
      el.btnSaveHubToken.addEventListener('click', async () => {
        const token = (el.hubTokenInput && el.hubTokenInput.value || '').trim();
        if (!token) {
          showToast('请输入有效的访问令牌', 'warn');
          return;
        }
        setHubToken(token);
        showAuthBar(false);
        showToast('访问令牌已保存，正在连接云端...', 'info');
        if (window.syncService) {
          await window.syncService.syncWithCloud();
        }
      });
    }
    if (el.btnSkipHubToken) {
      el.btnSkipHubToken.addEventListener('click', () => {
        showAuthBar(false);
        showToast('已切换为仅本地模式，云端同步不可用', 'warn');
      });
    }
    window.addEventListener('ipet:auth_required', () => {
      showAuthBar(true);
      showToast('需要访问令牌才能读写云端线索', 'warn');
    });

    if (el.btnCopyEnrollLink) {
      el.btnCopyEnrollLink.addEventListener('click', async () => {
        const link = buildEnrollLink();
        if (!link) {
          showToast('当前尚未接入云端，请先保存访问令牌', 'warn');
          showAuthBar(true);
          return;
        }
        try {
          await navigator.clipboard.writeText(link);
          showToast('开通链接已复制。发给同事，点开即自动接入，无需再粘贴令牌', 'success');
        } catch (e) {
          window.prompt('复制此开通链接发给同事：', link);
        }
      });
    }
  }

  // Toast 通知辅助函数 (纯文字，无任何 Icon/Emoji)
  function showToast(message, type = 'info') {
    if (!el.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div>${escapeHtml(message)}</div>`;
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  // 初始化应用
  async function init() {
    bindActionEvents();
    bindModalEvents();
    bindEmailEvents();
    bindAuthEvents();
    bindToolbarEvents();
    bindBatchEvents();
    bindEnrichEvents();
    bindMailEvents();

    // 一键开通链接：#t=TOKEN 自动入账，无需手动粘贴
    const enrolled = tryEnrollFromUrl();

    // 同步令牌到全局，供 sync/jev 使用
    const existing = getHubToken();
    if (existing) {
      window.IPET_HUB_TOKEN = existing;
      showAuthBar(false);
      if (enrolled) {
        showToast('已通过开通链接接入云端，后续打开无需再填令牌', 'success');
      }
    } else {
      showAuthBar(true);
    }

    // 订阅数据变动
    if (window.syncService) {
      window.syncService.subscribe((leads, status) => {
        updateSyncIndicator(status);
        refreshVisibleTable();
      });

      // 首次载入渲染
      refreshVisibleTable();
    }
  }

  // 同步指示器渲染 (纯文字 + CSS 圆点，无 Emoji)
  function updateSyncIndicator(status) {
    if (!el.cloudSyncStatus) return;
    let text = '云端已全量同步';
    let color = '#059669';
    let bg = '#ecfdf5';
    let border = '#a7f3d0';

    if (status === 'syncing') {
      text = '正在云端同步...';
      color = '#2563eb';
      bg = '#eff6ff';
      border = '#bfdbfe';
    } else if (status === 'offline') {
      text = '离线/本地存储';
      color = '#d97706';
      bg = '#fffbeb';
      border = '#fde68a';
    } else if (status === 'error') {
      text = '同步异常';
      color = '#dc2626';
      bg = '#fef2f2';
      border = '#fecaca';
    }

    el.cloudSyncStatus.style.color = color;
    el.cloudSyncStatus.style.background = bg;
    el.cloudSyncStatus.style.borderColor = border;
    el.cloudSyncStatus.innerHTML = `<span class="sync-dot" style="background-color: ${color};"></span> ${text}`;
  }

  // 绑定顶部、粘贴区与研判按钮事件
  function bindActionEvents() {
    // 1. 刷新云端
    if (el.btnSyncNow) {
      el.btnSyncNow.addEventListener('click', async () => {
        showToast('正在向云端拉取并核对最新线索...', 'info');
        if (window.syncService) {
          await window.syncService.syncWithCloud();
          showToast('全网线索资产同步完成', 'success');
        }
      });
    }

    // 2. 导入更多 CSV
    if (el.btnImportCsv && el.leadCsvFileInput) {
      el.btnImportCsv.addEventListener('click', () => {
        el.leadCsvFileInput.click();
      });

      el.leadCsvFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const csvText = evt.target.result;
            if (!window.Normalizer || !window.syncService) return;
            const parsed = window.Normalizer.parseCSV(csvText, 'CSV 批量导入');
            if (!parsed || parsed.length === 0) {
              showToast('未能从 CSV 中提取到有效记录', 'warn');
              return;
            }

            showToast(`正在批量导入 ${parsed.length} 条记录并触发研判...`, 'info');
            const res = await window.syncService.ingestBatch(parsed, { skipDuplicates: true });
            showToast(`导入成功 ${res.imported} 条，跳过重复 ${res.duplicates} 条`, 'success');
            el.leadCsvFileInput.value = '';
          } catch (err) {
            console.error('CSV Import Error:', err);
            showToast('CSV 导入失败: ' + err.message, 'error');
          }
        };
        reader.readAsText(file);
      });
    }

    // 3. 快捷粘贴录入跳转
    if (el.btnFocusPaste) {
      el.btnFocusPaste.addEventListener('click', () => {
        if (el.pasteLeadInput) {
          el.pasteLeadInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.pasteLeadInput.focus();
        }
      });
    }

    // 4. 清空本地导入
    if (el.btnClearCustom) {
      el.btnClearCustom.addEventListener('click', async () => {
        if (confirm('确认清空本地自定义导入的线索资产？系统将重置并保留官方真实线索。')) {
          if (window.syncService) {
            await window.syncService.clearCustomLeads();
            showToast('已重置为官方真实线索资产', 'info');
          }
        }
      });
    }

    // 5. 快捷粘贴：先解析预览，确认后再入库
    let pendingPasteLead = null;

    function renderPastePreview(lead) {
      if (!el.pastePreview || !el.pastePreviewGrid) return;
      const params = lead.detected_params || lead.technical_parameters || {};
      const brief = lead.analysis_brief || {};
      const rows = [
        ['客户姓名', lead.name],
        ['企业邮箱', lead.email],
        ['企业', lead.company],
        ['职位', lead.job_title],
        ['电话', lead.phone],
        ['渠道', lead.channel_source],
        ['需求原文', lead.raw_requirements],
        ['MTOW', params.mtow],
        ['电压', params.voltage],
        ['机型', params.uav_type],
        ['项目阶段', params.stage],
        ['采购诉求', brief['采购诉求']]
      ];
      el.pastePreviewGrid.innerHTML = rows.map(([k, v]) => {
        const empty = !v;
        return `<div class="paste-preview-item">
          <label>${k}</label>
          <div class="val ${empty ? 'empty' : 'ok'}">${escapeHtml(String(v || '（未识别）'))}</div>
        </div>`;
      }).join('');
      el.pastePreview.removeAttribute('hidden');
    }

    function hidePastePreview() {
      if (el.pastePreview) el.pastePreview.setAttribute('hidden', '');
      if (el.btnPasteConfirm) el.btnPasteConfirm.setAttribute('hidden', '');
      if (el.btnPasteCancel) el.btnPasteCancel.setAttribute('hidden', '');
      if (el.btnPasteLead) el.btnPasteLead.removeAttribute('hidden');
      pendingPasteLead = null;
    }

    if (el.btnPasteLead) {
      el.btnPasteLead.addEventListener('click', async () => {
        const text = (el.pasteLeadInput?.value || '').trim();
        if (!text) {
          showToast('请在此粘贴后台客户留言或邮件文本', 'warn');
          return;
        }
        try {
          const normalized = window.Normalizer
            ? window.Normalizer.parseFreeText(text, '多渠道粘贴录入')
            : { raw_text: text };
          pendingPasteLead = normalized;
          renderPastePreview(normalized);
          if (el.btnPasteConfirm) el.btnPasteConfirm.removeAttribute('hidden');
          if (el.btnPasteCancel) el.btnPasteCancel.removeAttribute('hidden');
          if (el.btnPasteLead) el.btnPasteLead.setAttribute('hidden', '');
          if (el.pasteSyncIndicator) el.pasteSyncIndicator.innerText = '解析完成，请核对下方字段';
        } catch (e) {
          showToast('解析失败: ' + e.message, 'error');
        }
      });
    }

    if (el.btnPasteCancel) {
      el.btnPasteCancel.addEventListener('click', () => {
        hidePastePreview();
        if (el.pasteSyncIndicator) el.pasteSyncIndicator.innerText = '';
        showToast('已取消入库', 'info');
      });
    }

    if (el.btnPasteConfirm) {
      el.btnPasteConfirm.addEventListener('click', async () => {
        if (!pendingPasteLead || !window.syncService) return;
        const normalized = pendingPasteLead;
        if (el.pasteSyncIndicator) {
          el.pasteSyncIndicator.innerText = '正在入库并研判...';
        }
        try {
          const res = await window.syncService.ingestLead(normalized);
          hidePastePreview();
          el.pasteLeadInput.value = '';
          if (el.pasteSyncIndicator) {
            el.pasteSyncIndicator.innerText = '已完成入库并同步云端';
            setTimeout(() => { if (el.pasteSyncIndicator) el.pasteSyncIndicator.innerText = ''; }, 3000);
          }
          showToast('线索已入库', 'success');
          if (res && res.lead && res.lead.id) {
            const lead = res.lead;
            try {
              const analysis = window.InquiryResponder.analyzeLead(lead);
              const validity = window.InquiryResponder.judgeValidity(lead, analysis);
              if (validity.disposition === 'PASS') {
                showToast(`判定：${validity.label} — ${validity.summary}`, 'warn');
              } else if (validity.disposition === 'DECLINE') {
                showToast(`判定：${validity.label} — 已准备拒绝函模板`, 'warn');
              } else if (validity.disposition === 'NEED_INFO') {
                showToast(`判定：${validity.label} — 建议短问补参`, 'info');
              }
            } catch (e) {}
            openEmailModal(res.lead.id);
            runEnrichment(res.lead, { silent: true });
          }
        } catch (err) {
          console.error('Paste lead error:', err);
          showToast('入库失败: ' + err.message, 'error');
          if (el.pasteSyncIndicator) el.pasteSyncIndicator.innerText = '';
        }
      });
    }

    // 6. 触发 TypeSafe Jev 重新研判（默认增量，仅重判需要更新的线索）
    if (el.btnReevaluateAllJev) {
      el.btnReevaluateAllJev.addEventListener('click', async (ev) => {
        if (!window.syncService || !window.jevEngine) return;
        const forceAll = ev.shiftKey === true;
        const allLeads = window.syncService.getAllLeads();
        if (allLeads.length === 0) {
          showToast('当前无可用线索资产', 'warn');
          return;
        }

        const targets = forceAll
          ? allLeads.slice()
          : allLeads.filter(l => window.jevEngine.needsRescore(l));

        if (targets.length === 0) {
          showToast('所有线索研判均为最新，无需重新打分（Shift+点击可强制全量）', 'info');
          return;
        }

        if (el.reevaluateStatus) {
          el.reevaluateStatus.innerText = `正在研判 ${targets.length}/${allLeads.length} 条${forceAll ? '（强制全量）' : '（增量）'}...`;
        }
        el.btnReevaluateAllJev.disabled = true;

        try {
          for (let i = 0; i < targets.length; i++) {
            const lead = targets[i];
            const promptText = (lead.raw_requirements || lead.raw_text || '') + ' ' + JSON.stringify(lead.fields_filled || {});
            const jevRes = await window.jevEngine.scoreLeadIntent(promptText, lead.email, lead.company, lead.job_title);
            if (jevRes) {
              lead.jev_analysis = {
                ...lead.jev_analysis,
                ...jevRes,
                source: jevRes.source || lead.jev_analysis?.source || 'jev_calibrated',
                rescored_at: new Date().toISOString()
              };
              lead.updated_at = new Date().toISOString();
              lead.sync_version = (lead.sync_version || 0) + 1;
            }
            if (el.reevaluateStatus && (i % 5 === 0 || i === targets.length - 1)) {
              el.reevaluateStatus.innerText = `研判进度 ${i + 1}/${targets.length}`;
            }
          }

          window.syncService.saveLeads(allLeads);

          if (el.reevaluateStatus) {
            el.reevaluateStatus.innerText = `研判完成：更新 ${targets.length} 条，跳过 ${allLeads.length - targets.length} 条`;
            setTimeout(() => { if (el.reevaluateStatus) el.reevaluateStatus.innerText = ''; }, 5000);
          }
          showToast(`研判完成：${targets.length} 条已更新`, 'success');
        } catch (err) {
          console.error('Re-evaluate error:', err);
          showToast('研判发生异常: ' + err.message, 'error');
          if (el.reevaluateStatus) el.reevaluateStatus.innerText = '';
        } finally {
          el.btnReevaluateAllJev.disabled = false;
        }
      });
    }
  }

  // 智能解析线索来源渠道与转化场景 (纯文本与规范类名)
  function resolveLeadSourceChannel(lead) {
    if (lead.channel_source && lead.channel_scenario) {
      let badge = "badge-info";
      if (lead.channel_source.includes("官网")) badge = "badge-success";
      else if (lead.channel_source.includes("DroneX") || lead.channel_source.includes("展会")) badge = "badge-warn";
      return {
        channel: lead.channel_source,
        badgeClass: badge,
        scenario: lead.channel_scenario
      };
    }

    const fullText = ((lead.raw_text || "") + " " + (lead.raw_requirements || "") + " " + (lead.form_name || "") + " " + (lead.email || "") + " " + (lead.company || "") + " " + JSON.stringify(lead.fields_filled || {})).toLowerCase();

    // 1. DroneX / 国际航展线下对接渠道
    if (fullText.includes("dronex") || fullText.includes("trade show") || fullText.includes("booth") || fullText.includes("kaixin") || fullText.includes("kxprecision") || fullText.includes("展台") || fullText.includes("展会")) {
      return {
        channel: "DroneX 展会对接",
        badgeClass: "badge-warn",
        scenario: "2026 伦敦航展展位预约 (Booth Meeting)"
      };
    }

    // 2. 官网独立站询盘渠道
    if (fullText.includes("ecshop") || fullText.includes("留言") || lead.form_name === 'IPET客户留言' || lead.form_name === '邮件快捷解析入库' || fullText.includes("gremsy") || fullText.includes("baaco") || fullText.includes("matzka")) {
      let scenario = "官网商业采购与技术选型";
      if (fullText.includes("baaco") || (lead.job_title || "").toLowerCase().includes("purchasing") || (lead.job_title || "").toLowerCase().includes("procurement")) {
        scenario = "商业采购与规格对接 (Procurement RFQ)";
      } else if (fullText.includes("gremsy") || fullText.includes("i7")) {
        scenario = "I7 云台载荷选型 (Gimbal R&D)";
      } else if (fullText.includes("matzka") || fullText.includes("flight test")) {
        scenario = "多旋翼试飞样机采购 (Flight Testing)";
      } else if (fullText.includes("i8") || fullText.includes("heavy lift")) {
        scenario = "I8 重载动力选型 (Heavy Lift)";
      }
      return {
        channel: "官网独立站询盘",
        badgeClass: "badge-success",
        scenario: scenario
      };
    }

    // 3. LinkedIn 广告原生转化表单
    return {
      channel: "LinkedIn 广告转化",
      badgeClass: "badge-info",
      scenario: lead.form_name || "原生潜客表单 (Lead Gen Form)"
    };
  }

  // 综合解析线索中的采购需求与技术意图（结构化分析）
  function synthesizeLeadFields(lead) {
    if (window.Normalizer && typeof window.Normalizer.synthesizeAnalysis === 'function') {
      return window.Normalizer.synthesizeAnalysis(lead);
    }

    const rawObj = lead.fields_filled || {};
    const p = lead.technical_parameters || lead.detected_params || {};

    const ANALYSIS_STANDARD_KEYS = ['采购诉求', '需求类型', '咨询产品', '业务类型', '业务定位', '飞行器形态', '起飞重量', '核心技术指标', '应用场景', '研发阶段', '交付物需求', '交付物诉求', '合作诉求', '合作意向'];
    const isPreAnalyzed = Object.keys(rawObj).some(k => ANALYSIS_STANDARD_KEYS.includes(k));

    const EXCLUDED_PROFILE_KEYS = new Set([
      'your-name', 'name', 'fullname', 'first_name', 'last_name', '姓名', '客户姓名', '客户', '联系人',
      'contact-email', 'email', 'e-mail', 'work_email', '邮箱', '电子邮箱', '企业邮箱',
      'org-name', 'company', 'company_name', 'organization', '公司', '企业名称',
      'phone', 'phone_number', 'mobile', 'tel', 'whatsapp', '电话', '联系电话', '手机',
      'time', 'submitted_at', 'date', '时间', '接收时间',
      'ip', 'ip_address', 'IP', 'IP地址', 'form_name', '表单名字', 'channel', '渠道', 'id'
    ]);

    if (isPreAnalyzed) {
      const cleanObj = {};
      for (const [k, v] of Object.entries(rawObj)) {
        if (!EXCLUDED_PROFILE_KEYS.has(k) && !EXCLUDED_PROFILE_KEYS.has(k.toLowerCase()) && v) {
          cleanObj[k] = v;
        }
      }
      if (Object.keys(cleanObj).length > 0) {
        return cleanObj;
      }
    }

    const fullText = [
      lead.name || '',
      lead.company || '',
      lead.job_title || '',
      lead.raw_text || '',
      lead.raw_requirements || '',
      lead.channel_scenario || '',
      Object.entries(rawObj).map(([k, v]) => `${k}: ${v}`).join(' ')
    ].join(' ');
    const textLower = fullText.toLowerCase();

    const analyzed = {};

    // 1. 采购诉求 / 业务定位 / 需求类型
    if (textLower.includes('wire bonding') || textLower.includes('microelectronics') || textLower.includes('die attach') || textLower.includes('packaging supplier')) {
      analyzed['业务类型'] = '微电子封装与组装外协对接 (Microelectronics Packaging Supplier)';
      analyzed['合作诉求'] = '探讨引线键合 (Wire Bonding) 及芯片封装外协合作';
    } else if (textLower.includes('dronex') || textLower.includes('kaixin') || textLower.includes('prototype supplier') || textLower.includes('booth')) {
      analyzed['需求类型'] = '展会现场展台商务对接 (DroneX Trade Show Booth Meeting)';
      analyzed['业务定位'] = '样件打样与精密五金外协供应链 (Precision Prototype Supplier)';
    } else if (textLower.includes('i7') || textLower.includes('gremsy') || textLower.includes('gimbal')) {
      analyzed['咨询产品'] = 'IPET I7 一体化动力系统 (电机 + 电调 + 螺旋桨)';
      analyzed['技术诉求'] = '低电磁干扰 (Low EMI) 与云台低震动动力匹配';
    } else if (textLower.includes('dyno') && (textLower.includes('coaxial') || textLower.includes('heavy-lift') || textLower.includes('heavy lift'))) {
      const weightHint = p.mtow || (textLower.match(/(\d+\s*kg)/i) || [])[1] || '重载';
      analyzed['采购诉求'] = `${weightHint} 共轴重载动力总成选型与实测台架曲线 (Dyno Data RFQ)`;
    } else if (textLower.includes('ndaa') || textLower.includes('heavy lift') || textLower.includes('65kg') || textLower.includes('65 kg')) {
      analyzed['采购诉求'] = `${p.mtow || '重载'} 工业飞行器动力总成与电调匹配 (NDAA 标称动力 RFQ)`;
    } else if (textLower.includes('catalog') && (textLower.includes('wholesale') || textLower.includes('pricing') || textLower.includes('bulk'))) {
      analyzed['采购诉求'] = '索取工业无人机动力目录、批发价目表及起订量 (Catalog & Wholesale Pricing)';
    } else if (textLower.includes('procurement') || textLower.includes('purchasing') || textLower.includes('matzka') || textLower.includes('baaco')) {
      analyzed['需求类型'] = '商业采购与技术规格对接 (Procurement RFQ)';
      analyzed['咨询产品'] = 'IPET 工业级动力系统 (电机/电调总成与结构件匹配)';
    } else if (lead.raw_requirements && lead.raw_requirements.length > 5 && !/原始自由文本|linkedin lead gen form|ipet system lead form/i.test(lead.raw_requirements)) {
      analyzed['采购诉求'] = lead.raw_requirements.slice(0, 70);
    } else if (lead.raw_text && lead.raw_text.length > 15 && !/^(linkedin lead gen form|ipet system lead form)\s*$/i.test(String(lead.raw_text).trim())) {
      const rt = String(lead.raw_text).replace(/\s+/g,' ').replace(/原始自由文本:?/g,'').trim();
      if (rt.length > 15) analyzed['采购诉求'] = rt.slice(0, 70);
      else analyzed['采购诉求'] = '原表单未填写明确需求（待补全）';
    } else {
      analyzed['采购诉求'] = '原表单未填写明确需求（待补全）';
      analyzed['解析状态'] = '身份/需求字段缺失，请核对粘贴原文或手动补全';
    }

    // 2. 飞行器形态
    let uavType = p.uav_type || '';
    if (!uavType) {
      if (textLower.includes('coaxial') || textLower.includes('x8') || textLower.includes('共轴')) {
        uavType = '共轴重载飞行平台 (Coaxial Multi-rotor)';
      } else if (textLower.includes('vtol') || textLower.includes('垂直起降')) {
        uavType = '垂直起降固定翼 (VTOL)';
      } else if (textLower.includes('multirotor') || textLower.includes('多旋翼') || textLower.includes('quad') || textLower.includes('hexa') || textLower.includes('octo')) {
        uavType = '多旋翼飞行平台 (Multirotor · Heavy Lift)';
      } else if (textLower.includes('microelectronics')) {
        uavType = '特种构型 (外协微电子与元器件组装)';
      }
    }
    if (uavType) analyzed['飞行器形态'] = uavType;

    // 3. 起飞重量 MTOW
    let mtow = p.mtow || '';
    if (!mtow) {
      const mM = fullText.match(/(?:aircraft-weight|mtow|takeoff|weight|起飞重量|载重)[:：\s]+(\d+(?:\.\d+)?\s*(?:kg|公斤)?)/i) || fullText.match(/(\d+(?:\.\d+)?\s*kg\s*mtow)/i);
      if (mM) mtow = mM[1].trim();
    }
    if (mtow && mtow.toUpperCase() !== 'N/A') {
      analyzed['起飞重量'] = mtow.toLowerCase().includes('kg') ? (mtow.toLowerCase().includes('mtow') ? mtow : `${mtow} MTOW`) : `${mtow} kg MTOW`;
    }

    // 4. 核心技术指标
    const specs = [];
    let volt = p.voltage || '';
    if (!volt) {
      const vM = fullText.match(/(?:bus-voltage|voltage|母线电压|工作电压)[:：\s]+([^,\n\s]+)/i);
      if (vM) volt = vM[1].trim();
    }
    if (volt) specs.push(`母线工作电压 ${volt}`);

    if (p.thrust) specs.push(`额定/峰值推力 ${p.thrust}`);
    if (p.payload) specs.push(`有效任务载荷 ${p.payload}`);
    if (p.propeller) specs.push(`推荐桨叶 ${p.propeller}`);

    if (textLower.includes('coaxial') || textLower.includes('x8')) specs.push('共轴动力驱动总成匹配');
    if (textLower.includes('low emi') || textLower.includes('foc')) specs.push('FOC 超低电磁干扰 (Low EMI)');
    if (textLower.includes('ipx6')) specs.push('工业防护等级 IPX6');
    if (textLower.includes('ndaa')) specs.push('要求 NDAA 供应链合规');

    if (specs.length > 0) {
      analyzed['核心技术指标'] = specs.join(' / ');
    }

    // 5. 应用场景
    let app = '';
    if (textLower.includes('drone delivery') || textLower.includes('delivery') || textLower.includes('物流') || textLower.includes('配送')) {
      app = '工业无人机物流配送 (Drone Delivery)';
    } else if (textLower.includes('inspection') || textLower.includes('巡检') || textLower.includes('电力')) {
      app = '电力与能源长航时工业巡检 (Inspection UAS)';
    } else if (textLower.includes('agriculture') || textLower.includes('植保') || textLower.includes('spray')) {
      app = '大载重农业植保飞防 (Agricultural Spraying)';
    } else if (textLower.includes('microelectronics') || textLower.includes('packaging')) {
      app = '微电子封装与五金元器件加工 (Microelectronics)';
    } else if (textLower.includes('heavy lift') || textLower.includes('heavy-lift') || textLower.includes('重载')) {
      app = '大载重工业无人飞行作业平台';
    }
    if (app) analyzed['应用场景'] = app;

    // 6. 研发阶段
    let stage = p.stage || '';
    if (!stage) {
      if (textLower.includes('flight test') || textLower.includes('flight-test') || textLower.includes('试飞')) {
        stage = 'Flight Testing (试飞验证阶段)';
      } else if (textLower.includes('prototype') || textLower.includes('bench test') || textLower.includes('打样') || textLower.includes('样机')) {
        stage = 'Prototype Bench Testing (样机研制阶段)';
      } else if (textLower.includes('concept') || textLower.includes('评估') || textLower.includes('可行性')) {
        stage = 'Concept Evaluation (概念可行性评估阶段)';
      }
    }
    if (stage) analyzed['研发阶段'] = stage;

    // 7. 交付物诉求
    const deliverables = [];
    if (textLower.includes('dyno') || textLower.includes('thrust curve') || textLower.includes('台架')) {
      deliverables.push('实测推力台架数据表 (Dyno Sheets)');
    }
    if (textLower.includes('step') || textLower.includes('cad') || textLower.includes('3d') || textLower.includes('模型')) {
      deliverables.push('电机总成 3D STEP 安装模型');
    }
    if (textLower.includes('quote') || textLower.includes('pricing') || textLower.includes('rfq') || textLower.includes('报价') || textLower.includes('sample')) {
      deliverables.push('样机测试报价与规格书');
    }
    if (deliverables.length > 0) {
      analyzed['交付物诉求'] = deliverables.join('、');
    }

    return analyzed;
  }

  // 渲染 10 列完整销售线索资产表格 (严格对齐参考截图，零图标/零 Emoji)
  function renderTable(leads) {
    if (!el.leadsTableBody) return;
    el.leadsTableBody.innerHTML = '';

    if (el.leadCountNumber) {
      el.leadCountNumber.innerText = leads.length;
    }

    if (leads.length === 0) {
      el.leadsTableBody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 40px; color: var(--text-dim);">
            当前暂无匹配线索资产
          </td>
        </tr>
      `;
      return;
    }

    leads.forEach((l) => {
      const j = l.jev_analysis || {
        tier: "TIER_3_EXPLORATORY",
        maturity_score: 0
      };

      const grade = resolveIntentGrade(l);
      // 表格用紧凑标签，避免换行截断
      const gradeCode = (grade.code || '').split('_')[0] || 'G-';
      const gradeShort = grade.short || grade.label || '';
      const tierLabel = `${gradeCode} ${gradeShort}`;
      const badge = `badge-${grade.badge}`;

      const isLiveApi = j.source === 'jev_live';
      const liveBadge = isLiveApi
        ? `<span class="jev-mini" title="TypeSafe Jev ${escapeHtml(j.model || 'jev-latest')}">Jev</span>`
        : '';

      const analyzedFields = synthesizeLeadFields(l);
      const fieldsHtml = Object.entries(analyzedFields).map(([k, v]) => `
        <div style="font-size: 11px; margin-bottom: 3px; line-height: 1.4;">
          <span style="color: var(--text-dim);">${escapeHtml(k)}:</span> <strong>${escapeHtml(v)}</strong>
        </div>
      `).join('');

      let rawCleanName = (l.name || "").replace(/^(?:(?:IPET)?\s*(?:客户留言|客户姓名|客户|Contact|Name|Full Name|姓名)[:：\s]*)+/gi, "").trim() || l.name || '-';
      if (rawCleanName.toLowerCase().includes("aishwarya") || rawCleanName.toLowerCase().includes("aishwerya")) rawCleanName = "Aishwarya Gahlot";
      else if (rawCleanName.toLowerCase().includes("doug geary")) rawCleanName = "Doug Geary";
      const cleanDisplayName = escapeHtml(rawCleanName);

      let cleanComp = l.company || '-';
      if (cleanComp.includes("firstlevelinc.com") || cleanComp.toLowerCase().includes("first level inc")) cleanComp = "First level Inc.";
      else if (cleanComp.includes("soaringaero") || cleanComp.toLowerCase().includes("soaring aerospace")) cleanComp = "Soaring Aerospace";

      let cleanTitle = l.job_title || '-';
      if (!cleanTitle || cleanTitle === '-' || cleanTitle === '(-)') {
        const fullT = (l.raw_text || '') + ' ' + (l.raw_requirements || '') + ' ' + JSON.stringify(l.fields_filled || {});
        if (fullT.toLowerCase().includes("aeronautical engineer")) cleanTitle = "Aeronautical Engineer (航空航天工程师)";
        else if (fullT.toLowerCase().includes("microelectronics assembly") || fullT.toLowerCase().includes("first level")) cleanTitle = "商务与技术外协代表 (Microelectronics)";
        else if (fullT.toLowerCase().includes("project manager") || cleanComp.includes("Al Hathboor")) cleanTitle = "Project Manager";
        else if (fullT.toLowerCase().includes("purchasing manager") || cleanComp.includes("Baaco")) cleanTitle = "Purchasing Manager";
        else if (fullT.toLowerCase().includes("gremsy")) cleanTitle = "云台与载荷研发评估组 (Gimbal & Payload R&D)";
        else if (fullT.toLowerCase().includes("kaixin") || fullT.toLowerCase().includes("dronex")) cleanTitle = "海外业务与商务代表 (Business Development)";
        else if (fullT.toLowerCase().includes("matzka")) cleanTitle = "Procurement Manager";
      }

      let cleanSubmittedTime = l.submitted_at || '-';
      const fullT = (l.raw_text || '') + ' ' + (l.raw_requirements || '') + ' ' + JSON.stringify(l.fields_filled || {});
      const timeM = fullT.match(/(?:时间|Time|Date)[:：\s]+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)/i);
      if (timeM && timeM[1]) cleanSubmittedTime = timeM[1].trim();

      let cleanScenario = l.channel_scenario || '';
      if (fullT.toLowerCase().includes("65 kg") || fullT.toLowerCase().includes("ndaa")) cleanScenario = "65kg 重载多旋翼动力总成选型 (Heavy Lift UAS)";
      else if (fullT.toLowerCase().includes("microelectronics")) cleanScenario = "微电子元器件外协对接 (Microelectronics Packaging)";
      const sourceInfo = resolveLeadSourceChannel({ ...l, channel_scenario: cleanScenario });

      // 提交时间拆成 日期 / 时间 两行
      let datePart = cleanSubmittedTime || '-';
      let timePart = '';
      const dtMatch = String(cleanSubmittedTime || '').match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)/);
      if (dtMatch) {
        datePart = dtMatch[1];
        timePart = dtMatch[2];
      } else if (String(cleanSubmittedTime || '').includes('T')) {
        const d = new Date(cleanSubmittedTime);
        if (!Number.isNaN(d.getTime())) {
          datePart = d.toISOString().slice(0, 10);
          timePart = d.toISOString().slice(11, 16);
        }
      }

      const actionLabel = grade.code === 'G0_PASS' ? '处理 · Pass'
        : grade.code === 'G1_DECLINE' ? '生成拒绝函'
        : grade.code === 'G2_SUPPLIER' ? '供应链模板'
        : grade.code === 'G3_NURTURE' ? '生成补参短问'
        : '生成专业英文邮件';

      const tr = document.createElement('tr');
      tr.dataset.id = l.id;
      tr.innerHTML = `
        <td class="cell-check"><input type="checkbox" class="row-select" data-id="${escapeHtml(l.id)}" ${selectedLeadIds.has(l.id) ? 'checked' : ''}></td>
        <td class="cell-time">
          <div class="time-date">${escapeHtml(datePart)}</div>
          ${timePart ? `<div class="time-clock">${escapeHtml(timePart)}</div>` : ''}
        </td>
        <td class="cell-one-line cell-name"><strong>${cleanDisplayName}</strong></td>
        <td class="cell-one-line cell-email">${l.email ? `<a href="mailto:${escapeHtml(l.email)}" title="${escapeHtml(l.email)}">${escapeHtml(l.email)}</a>` : '<span class="cell-dim">-</span>'}</td>
        <td class="cell-one-line cell-org editable-cell" data-field="company" data-id="${escapeHtml(l.id)}" title="双击编辑企业/职位">
          <strong>${escapeHtml(cleanComp)}</strong>${cleanTitle && cleanTitle !== '-' ? `<span class="cell-dim"> · ${escapeHtml(cleanTitle)}</span>` : ''}
        </td>
        <td class="cell-source">
          <div class="cell-source-tag"><span class="badge ${sourceInfo.badgeClass}">${escapeHtml(sourceInfo.channel)}</span></div>
          <div class="cell-source-desc" title="${escapeHtml(sourceInfo.scenario || '')}">${escapeHtml(sourceInfo.scenario || '')}</div>
        </td>
        <td class="cell-req">${fieldsHtml}</td>
        <td class="intent-cell">
          <div class="intent-row">
            <span class="badge ${badge} intent-badge">${tierLabel}</span>${liveBadge}
          </div>
          <div class="intent-action" title="${escapeHtml(grade.primary_action || '')}">${escapeHtml(grade.primary_action || '')}</div>
        </td>
        <td class="cell-one-line cell-score"><span class="score-num ${ (grade.maturity || 0) >= 4.0 ? 'score-hi' : 'score-mid'}">${(grade.maturity || 0).toFixed(1)} / 5.0</span></td>
        <td class="cell-strategy">${escapeHtml(j.recommended_action || grade.primary_action || '-')}</td>
        <td class="cell-action">
          <button class="btn btn-xs btn-primary btn-action-email" data-id="${escapeHtml(l.id)}">${escapeHtml(actionLabel)}</button>
        </td>
      `;
      el.leadsTableBody.appendChild(tr);
    });

    // 绑定行内按钮事件
    el.leadsTableBody.querySelectorAll('.btn-action-email').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openEmailModal(id);
      });
    });

    // 行选择
    el.leadsTableBody.querySelectorAll('.row-select').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-id');
        if (cb.checked) selectedLeadIds.add(id);
        else selectedLeadIds.delete(id);
        updateBatchBar();
      });
    });

    // 双击编辑企业
    el.leadsTableBody.querySelectorAll('.editable-cell').forEach(td => {
      td.addEventListener('dblclick', () => {
        const id = td.getAttribute('data-id');
        const lead = window.syncService && window.syncService.getAllLeads().find(l => l.id === id);
        if (!lead) return;
        const nextCompany = prompt('企业名称', lead.company || '');
        if (nextCompany === null) return;
        const nextTitle = prompt('职位', lead.job_title || '');
        if (nextTitle === null && nextCompany === (lead.company || '')) return;
        if (nextCompany !== null && nextCompany !== lead.company) lead.company = nextCompany.trim();
        if (nextTitle !== null && nextTitle !== lead.job_title) lead.job_title = nextTitle.trim();
        persistLeadMutation(lead);
        refreshVisibleTable();
        showToast('字段已更新', 'success');
      });
    });
  }

  // 绑定模态框基础显示与关闭事件
  function bindModalEvents() {
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close');
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
        document.body.classList.remove('modal-open');
      });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          document.body.classList.remove('modal-open');
        }
      });
    });
  }

  // 跟进邮件生成器交互
  function openEmailModal(leadId) {
    if (!window.syncService || !window.InquiryResponder) return;
    const lead = window.syncService.getAllLeads().find(l => l.id === leadId);
    if (!lead) return;

    currentEmailLead = lead;
    currentEmailAnalysis = window.InquiryResponder.analyzeLead(lead);

    // 统一意图分级 G0–G5
    const intent = window.InquiryResponder.classifyIntent
      ? window.InquiryResponder.classifyIntent(lead, currentEmailAnalysis)
      : null;
    const validity = (intent && intent.validity) || window.InquiryResponder.judgeValidity(lead, currentEmailAnalysis);
    currentEmailAnalysis.validity = validity;
    if (intent) {
      currentEmailAnalysis.intent_grade = intent;
      lead.intent_grade = intent.code;
      lead.intent_label = intent.label;
    }

    const card = window.InquiryResponder.buildDecisionCard(lead, currentEmailAnalysis);
    renderDecisionCard(card, validity, intent);

    // 背调：已有则展示，没有则自动跑（可人工修正）
    renderEnrichment(lead);
    if (!lead.enrichment && !lead.enrichment_manual) {
      runEnrichment(lead, { silent: true }).then(() => {
        if (currentEmailLead && currentEmailLead.id === lead.id) {
          const analysis2 = window.InquiryResponder.analyzeLead(lead);
          analysis2.validity = validity;
          const card2 = window.InquiryResponder.buildDecisionCard(lead, analysis2);
          renderDecisionCard(card2, validity, intent);
        }
      });
    }

    // 标题与分级 chip
    const gradeChip = document.getElementById('emailModalGradeChip');
    const titleEl = document.getElementById('emailModalTitle');
    const noSend = document.getElementById('noSendBanner');
    if (gradeChip && intent) {
      gradeChip.textContent = intent.label;
      gradeChip.className = `badge badge-${intent.badge}`;
      gradeChip.style.fontSize = '11px';
      gradeChip.style.fontWeight = 'normal';
      gradeChip.style.padding = '2px 8px';
    }
    if (titleEl) {
      titleEl.textContent =
        validity.disposition === 'PASS' ? '无效询盘处理台' :
        validity.disposition === 'DECLINE' ? '礼貌拒绝函工作台' :
        validity.disposition === 'NEED_INFO' ? '补参短问工作台' :
        validity.disposition === 'SUPPLIER' ? '供应链收件工作台' :
        '跟进邮件工作台';
    }
    if (noSend) {
      if (validity.disposition === 'PASS') noSend.removeAttribute('hidden');
      else noSend.setAttribute('hidden', '');
    }

    // 记录邮件生成，驱动漏斗（Pass 不算已发邮件）
    if (validity.disposition !== 'PASS' && !lead.email_generated_at) {
      lead.email_generated_at = new Date().toISOString();
      if (!lead.status || lead.status === 'new') lead.status = 'emailed';
      persistLeadMutation(lead);
    }
    lead.validity_disposition = validity.disposition;
    lead.validity_label = validity.label;

    // 渲染头部
    el.emailModalClientTitle.innerText = `${currentEmailAnalysis.callName} (${currentEmailAnalysis.cleanEnglishCompany})`;
    el.emailModalClientSub.innerText = `${currentEmailAnalysis.industryProfile} · ${currentEmailAnalysis.product || ''}`;

    let personaTag = `<span class="badge badge-success">商业整机 OEM</span>`;
    if (currentEmailAnalysis.persona === 'TYPE_A_ACADEMIC') personaTag = `<span class="badge badge-info">高校科研团队</span>`;
    else if (currentEmailAnalysis.persona === 'TYPE_S_SUPPLIER') personaTag = `<span class="badge badge-warn">外协供应链</span>`;
    else if (currentEmailAnalysis.persona === 'TYPE_D_DISQUALIFIED') personaTag = `<span class="badge badge-crit">业务边界回绝</span>`;
    if (intent) personaTag += ` <span class="badge badge-${intent.badge}">${escapeHtml(intent.short)}</span>`;
    el.emailModalPersonaBadge.innerHTML = personaTag;

    // 策略切角（含 Pass / 拒绝 / 补参分流）
    const strategies = window.InquiryResponder.getStrategies(currentEmailAnalysis, lead);
    renderEmailStrategies(strategies);

    // AI 深度定制状态
    if (lead.ai_analysis) {
      applyAiAnalysisToModal(lead, lead.ai_analysis);
      if (el.aiAnalyzeStatus) el.aiAnalyzeStatus.textContent = '已加载 AI 深度定制结果';
    } else {
      if (el.aiAnalyzeStatus) el.aiAnalyzeStatus.textContent = '';
      const oldAiBlock = document.querySelector('.ai-decision-block');
      if (oldAiBlock) oldAiBlock.remove();
    }

    el.modalEmail.classList.add('active');
    document.body.classList.add('modal-open');
    const scrollBox = document.getElementById('emailModalScroll');
    if (scrollBox) scrollBox.scrollTop = 0;
  }

  function renderDecisionCard(card, validity, intent) {
    const host = document.getElementById('decisionCard');
    if (!host || !card) return;
    const v = validity || card.validity;
    const chips = (v.reasons || []).map(r => `<span class="dc-chip ${v.badge || 'info'}">${escapeHtml(r)}</span>`).join('');
    const present = (card.params_present || []).length
      ? card.params_present.map(x => escapeHtml(x)).join(' · ')
      : '（未识别到工程参数）';
    const missing = (card.params_missing || []).length
      ? card.params_missing.map(x => `<span class="dc-chip warn">${escapeHtml(x)}</span>`).join('')
      : '<span class="dc-chip success">关键参数较完整</span>';
    const steps = (card.next_steps || []).map(s => `<li>${escapeHtml(s)}</li>`).join('');
    const gradeLine = intent
      ? `<div class="dc-chip ${intent.badge}" style="font-size:12px;">${escapeHtml(intent.label)}</div>
         <div style="margin-top:4px;font-family:var(--font-mono);font-size:11px;">主动作：${escapeHtml(intent.primary_action || '')}</div>`
      : '';

    host.innerHTML = `
      <div class="dc-block">
        <div class="dc-label">对方是谁</div>
        <div class="dc-value">
          <strong>${escapeHtml(card.who?.name || '-')}</strong> · ${escapeHtml(card.who?.company || '-')}<br>
          ${escapeHtml(card.who?.title || '-')}<br>
          <span style="color: var(--text-muted);">${escapeHtml(card.who?.industry || '')}</span>
        </div>
      </div>
      <div class="dc-block">
        <div class="dc-label">意图分级 · 有效性</div>
        <div class="dc-value">
          ${gradeLine}
          <div class="dc-chip ${v.badge || 'info'}" style="margin-top:6px;">${escapeHtml(v.label || '')}</div><br>
          ${chips}
          <div style="margin-top: 6px; font-family: var(--font-mono); font-size: 11px;">
            成熟度 ${escapeHtml(String(intent?.maturity ?? card.score?.maturity ?? '-'))}/5 · ${escapeHtml(String(intent?.legacy_tier || card.score?.tier || '-'))}
          </div>
          <div style="margin-top: 4px; color: var(--text-muted); font-size: 11px; line-height: 1.45;">${escapeHtml(v.summary || '')}</div>
        </div>
      </div>
      <div class="dc-block">
        <div class="dc-label">参数与下一步</div>
        <div class="dc-value">
          <div style="margin-bottom: 4px;"><span style="color: var(--text-dim);">已有:</span> ${present}</div>
          <div style="margin-bottom: 6px;"><span style="color: var(--text-dim);">缺失:</span> ${missing}</div>
          <ol>${steps}</ol>
        </div>
      </div>
    `;
  }

  function renderEmailStrategies(strategies) {
    if (!el.emailStrategyCards) return;
    el.emailStrategyCards.innerHTML = '';

    strategies.forEach((strat, idx) => {
      const card = document.createElement('div');
      card.className = `strategy-card ${idx === 0 ? 'selected' : ''}`;
      card.setAttribute('data-strat-id', strat.id);

      card.innerHTML = `
        <div class="strategy-info">
          <div class="strategy-title">
            <span>${strat.label}</span>
            <span class="strategy-tag">${strat.tag}</span>
          </div>
          <div class="strategy-desc">${strat.desc}</div>
        </div>
        <div class="radio-indicator"></div>
      `;

      card.addEventListener('click', () => {
        el.emailStrategyCards.querySelectorAll('.strategy-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectStrategy(strat.id);
      });

      el.emailStrategyCards.appendChild(card);
    });

    if (strategies.length > 0) {
      selectStrategy(strategies[0].id);
    }
  }

  function selectStrategy(strategyId) {
    selectedStrategyId = strategyId;
    if (currentEmailLead) {
      currentEmailLead.strategy_id = strategyId;
      currentEmailLead.strategy_selected_at = new Date().toISOString();
      persistLeadMutation(currentEmailLead);
    }
    const subjects = window.InquiryResponder.generateSubjectLinesForStrategy(currentEmailAnalysis, strategyId);
    renderEmailSubjects(subjects);
  }

  function renderEmailSubjects(subjects) {
    if (!el.emailSubjectList) return;
    el.emailSubjectList.innerHTML = '';

    subjects.forEach((subj, idx) => {
      const item = document.createElement('div');
      item.className = `subject-item ${idx === 0 ? 'selected' : ''}`;
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="radio" name="emailSubjectRadio" ${idx === 0 ? 'checked' : ''}>
          <span>${escapeHtml(subj.text)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="subject-badge">${subj.label}</span>
          <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">${subj.charCount} 字符</span>
        </div>
      `;

      item.addEventListener('click', () => {
        el.emailSubjectList.querySelectorAll('.subject-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        item.querySelector('input').checked = true;
        updateEmailBody(subj.text);
      });

      el.emailSubjectList.appendChild(item);
    });

    if (subjects.length > 0) {
      updateEmailBody(subjects[0].text);
    }
  }

  function updateEmailBody(subjectText) {
    selectedSubjectText = subjectText;
    if (currentEmailLead) {
      currentEmailLead.subject_used = subjectText;
      persistLeadMutation(currentEmailLead);
    }
    const body = window.InquiryResponder.generateCustomEmailBody(
      currentEmailAnalysis,
      selectedStrategyId,
      subjectText,
      { length: selectedEmailLength }
    );
    if (el.emailBodyTextarea) {
      el.emailBodyTextarea.value = body;
    }
    updateEmailLenMeta(body);
  }

  function updateEmailLenMeta(body) {
    const meta = document.getElementById('emailLenMeta');
    if (!meta) return;
    const text = String(body || '');
    const words = (text.match(/[A-Za-z]+/g) || []).length;
    const lines = text.split(/\n/).filter(Boolean).length;
    const hint = selectedEmailLength === 'short' ? '短文 · 易读优先'
      : selectedEmailLength === 'standard' ? '标准 · 信息完整'
      : '详细 · 工程清单';
    meta.textContent = `${hint} · 约 ${words} 词 / ${lines} 行`;
  }

  function bindEmailEvents() {
    document.querySelectorAll('#emailLengthSwitch .len-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedEmailLength = btn.getAttribute('data-len') || 'short';
        document.querySelectorAll('#emailLengthSwitch .len-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // 强制按当前策略+主题重生成，保证点击必变
        let subj = selectedSubjectText;
        if (!subj && currentEmailAnalysis && window.InquiryResponder) {
          const subjects = window.InquiryResponder.generateSubjectLinesForStrategy(currentEmailAnalysis, selectedStrategyId);
          subj = (subjects[0] && subjects[0].text) || '';
          if (subj) selectedSubjectText = subj;
        }
        if (currentEmailAnalysis && window.InquiryResponder) {
          updateEmailBody(subj || '');
        }
        if (el.emailBodyTextarea) {
          el.emailBodyTextarea.classList.remove('email-body-flash');
          void el.emailBodyTextarea.offsetWidth;
          el.emailBodyTextarea.classList.add('email-body-flash');
        }
        showToast(`邮件篇幅已切换：${btn.textContent}`, 'info');
      });
    });

    function assertOutboundReady() {
      // Pass 归档说明仅内部使用，不做外发校验
      if (selectedStrategyId === 'pass_archive') {
        showToast('这是内部归档说明，请勿外发。已可直接标记 Pass', 'warn');
        return false;
      }
      if (!window.InquiryResponder || !window.InquiryResponder.validateOutbound) return true;
      const check = window.InquiryResponder.validateOutbound(selectedSubjectText, el.emailBodyTextarea && el.emailBodyTextarea.value);
      if (!check.ok) {
        showToast(check.issues.join('；'), 'error');
        return false;
      }
      return true;
    }

    if (el.btnCopyEmail) {
      el.btnCopyEmail.addEventListener('click', () => {
        if (!assertOutboundReady()) return;
        const text = `Subject: ${selectedSubjectText}\n\n${el.emailBodyTextarea.value}`;
        navigator.clipboard.writeText(text).then(() => {
          if (currentEmailLead) {
            currentEmailLead.draft_generated_at = new Date().toISOString();
            currentEmailLead.subject_used = selectedSubjectText;
            currentEmailLead.strategy_id = selectedStrategyId;
            persistLeadMutation(currentEmailLead);
            refreshVisibleTable();
          }
          showToast('主题与正文已复制。发给客户后请点「已跟进」', 'success');
        });
      });
    }

    if (el.btnMarkPass) {
      el.btnMarkPass.addEventListener('click', async () => {
        if (!currentEmailLead) return;
        currentEmailLead.status = 'passed';
        currentEmailLead.validity_disposition = 'PASS';
        currentEmailLead.passed_at = new Date().toISOString();
        persistLeadMutation(currentEmailLead);
        if (window.syncService && window.syncService.deleteLead) {
          await window.syncService.deleteLead(currentEmailLead.id);
        }
        showToast('已标记 Pass 并归档，不生成外发邮件', 'success');
        if (el.modalEmail) el.modalEmail.classList.remove('active');
        document.body.classList.remove('modal-open');
        refreshVisibleTable();
      });
    }

    if (el.btnMarkFollowed) {
      el.btnMarkFollowed.addEventListener('click', () => {
        if (!currentEmailLead) return;
        const ts = new Date().toISOString();
        currentEmailLead.status = 'followed_up';
        currentEmailLead.followed_up_at = ts;
        currentEmailLead.strategy_id = selectedStrategyId || currentEmailLead.strategy_id;
        currentEmailLead.subject_used = selectedSubjectText || currentEmailLead.subject_used;
        persistLeadMutation(currentEmailLead);
        showToast('已标记「已跟进」，漏斗进度已更新', 'success');
        refreshVisibleTable();
        if (el.modalEmail) el.modalEmail.classList.remove('active');
        document.body.classList.remove('modal-open');
      });
    }

    if (el.btnOpenMailto) {
      el.btnOpenMailto.addEventListener('click', () => {
        if (!currentEmailLead || !currentEmailLead.email) {
          showToast('该线索无有效邮箱', 'warn');
          return;
        }
        if (!assertOutboundReady()) return;
        const to = currentEmailLead.email;
        const subj = encodeURIComponent(selectedSubjectText);
        const body = encodeURIComponent(el.emailBodyTextarea.value);
        currentEmailLead.draft_generated_at = new Date().toISOString();
        persistLeadMutation(currentEmailLead);
        window.open(`mailto:${to}?subject=${subj}&body=${body}`, '_blank');
        showToast('已打开邮件客户端。发出后回来点「已跟进」', 'info');
        refreshVisibleTable();
      });
    }

    if (el.btnRunAiAnalyze) {
      el.btnRunAiAnalyze.addEventListener('click', () => {
        if (!currentEmailLead) return;
        runAiAnalyze(currentEmailLead);
      });
    }
  }

  async function runAiAnalyze(lead, options = {}) {
    if (!lead) return;
    if (el.btnRunAiAnalyze) el.btnRunAiAnalyze.disabled = true;
    if (el.aiAnalyzeStatus) el.aiAnalyzeStatus.textContent = 'AI 正在研读需求与官网…';

    try {
      showToast('正在调用 Gemini Flash 生成专属工程回复...', 'info');
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: lead.name || lead.first_name || '',
          email: lead.email || '',
          company: lead.company || '',
          job_title: lead.job_title || '',
          source: lead.source || lead.lead_source || '',
          raw_text: lead.raw_text || lead.raw_requirements || lead.requirements || '',
          enrichment: lead.enrichment || lead.enrichment_manual || null
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.parsed) {
        throw new Error(data.error || 'AI 分析生成失败');
      }

      lead.ai_analysis = data.parsed;
      lead.ai_raw_markdown = data.raw_markdown;
      lead.ai_model = data.model;
      persistLeadMutation(lead);

      applyAiAnalysisToModal(lead, data.parsed);

      if (el.aiAnalyzeStatus) el.aiAnalyzeStatus.textContent = '已由 AI 深度定制 (Flash 0元)';
      showToast('AI 深度定制完成！纯正北美工程邮件已生成', 'success');
      refreshVisibleTable();
    } catch (err) {
      console.error('runAiAnalyze error:', err);
      if (el.aiAnalyzeStatus) el.aiAnalyzeStatus.textContent = '生成失败，可重试';
      showToast(`AI 生成失败: ${err.message}`, 'error');
    } finally {
      if (el.btnRunAiAnalyze) el.btnRunAiAnalyze.disabled = false;
    }
  }

  function applyAiAnalysisToModal(lead, ai) {
    if (!ai) return;

    // 1. 注入推荐邮件主题行
    if (Array.isArray(ai.subjects) && ai.subjects.length > 0) {
      const subjectObjs = ai.subjects.map((s, idx) => ({
        text: s,
        label: idx === 0 ? '官方回执 (首选)' : idx === 1 ? '自然跟进' : '项目对标',
        charCount: s.length
      }));
      renderEmailSubjects(subjectObjs);
    }

    // 2. 注入纯英文正文
    if (ai.email_body && el.emailBodyTextarea) {
      el.emailBodyTextarea.value = ai.email_body;
      updateEmailLenMeta(ai.email_body);
    }

    // 3. 增强决策卡：展示 AI 深度洞察与跟进备忘
    const host = document.getElementById('decisionCard');
    if (host) {
      const old = host.querySelector('.ai-decision-block');
      if (old) old.remove();

      const aiBlock = document.createElement('div');
      aiBlock.className = 'dc-block ai-decision-block';
      aiBlock.style.borderLeft = '3px solid var(--primary-accent, #3b82f6)';
      aiBlock.style.background = 'rgba(79, 126, 248, 0.05)';
      aiBlock.style.padding = '8px 12px';
      aiBlock.style.borderRadius = '4px';
      aiBlock.style.marginTop = '8px';
      aiBlock.innerHTML = `
        <div class="dc-label" style="color:var(--primary-accent, #3b82f6); font-weight:600;">AI 深度画像透视 (Gemini Flash 0元)</div>
        <div class="dc-value" style="font-size:12px; line-height:1.6;">
          <strong>客群画像：</strong>${escapeHtml(ai.persona || '-')}<br>
          <strong>中文参考：</strong>${escapeHtml(ai.chinese_brief || '-')}<br>
          <strong style="color:var(--text-accent, #eab308);">跟进预案：</strong>${escapeHtml(ai.follow_up_notes || '-')}
        </div>
      `;
      host.appendChild(aiBlock);
    }
  }

  // 转义 HTML 辅助函数
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 启动运行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
