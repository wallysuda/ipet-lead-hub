/**
 * IPET LEAD ASSETS HUB · 前端主控制器 (App Controller)
 */

(function () {
  'use strict';

  // 全局状态
  let channelTemplates = null;
  let currentFilteredLeads = [];
  let currentEmailLead = null;
  let currentEmailAnalysis = null;
  let selectedStrategyId = null;
  let selectedSubjectText = '';

  // DOM 元素引用
  const el = {
    statTotalLeads: document.getElementById('statTotalLeads'),
    statTier1Count: document.getElementById('statTier1Count'),
    statActiveChannels: document.getElementById('statActiveChannels'),
    statPendingAction: document.getElementById('statPendingAction'),
    syncIndicator: document.getElementById('syncIndicator'),
    syncStatusText: document.getElementById('syncStatusText'),
    btnSyncNow: document.getElementById('btnSyncNow'),
    btnExportCsv: document.getElementById('btnExportCsv'),
    btnOpenSettings: document.getElementById('btnOpenSettings'),
    btnOpenIngestModal: document.getElementById('btnOpenIngestModal'),
    searchInput: document.getElementById('searchInput'),
    filterChannel: document.getElementById('filterChannel'),
    filterTier: document.getElementById('filterTier'),
    filterPersona: document.getElementById('filterPersona'),
    btnResetFilters: document.getElementById('btnResetFilters'),
    tableCountSummary: document.getElementById('tableCountSummary'),
    leadsTableBody: document.getElementById('leadsTableBody'),

    // Ingest Modal
    modalIngest: document.getElementById('modalIngest'),
    presetChannelSelect: document.getElementById('presetChannelSelect'),
    presetFormFields: document.getElementById('presetFormFields'),
    btnSubmitPresetForm: document.getElementById('btnSubmitPresetForm'),
    freeTextInput: document.getElementById('freeTextInput'),
    freeTextChannel: document.getElementById('freeTextChannel'),
    btnSubmitFreeText: document.getElementById('btnSubmitFreeText'),
    csvFileInput: document.getElementById('csvFileInput'),
    csvTextInput: document.getElementById('csvTextInput'),
    csvPreviewArea: document.getElementById('csvPreviewArea'),
    csvRowCount: document.getElementById('csvRowCount'),
    csvPreviewTable: document.getElementById('csvPreviewTable'),
    csvSkipDuplicates: document.getElementById('csvSkipDuplicates'),
    btnSubmitCSV: document.getElementById('btnSubmitCSV'),

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

    // Detail Modal
    modalDetail: document.getElementById('modalDetail'),
    leadDetailContent: document.getElementById('leadDetailContent'),

    // Settings Modal
    modalSettings: document.getElementById('modalSettings'),
    settingApiKey: document.getElementById('settingApiKey'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),
    btnTestJev: document.getElementById('btnTestJev'),

    // Toasts
    toastContainer: document.getElementById('toastContainer')
  };

  // Toast 通知辅助函数
  function showToast(message, type = 'info') {
    if (!el.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'warn') icon = '⚠️';
    if (type === 'error') icon = '❌';
    toast.innerHTML = `<span>${icon}</span> <div>${message}</div>`;
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // 初始化应用
  async function init() {
    bindModalEvents();
    bindFilterEvents();
    bindIngestEvents();
    bindEmailEvents();
    bindSettingsEvents();

    // 加载渠道预设模板配置
    try {
      const res = await fetch('/data/channel_templates.json');
      if (res.ok) {
        channelTemplates = await res.json();
      }
    } catch (e) {
      console.warn('Failed to load channel templates:', e);
    }

    renderPresetFormFields('website_rfq');

    // 订阅数据变动
    if (window.syncService) {
      window.syncService.subscribe((leads, status) => {
        updateSyncIndicator(status);
        renderMetrics();
        applyFilters();
      });
      // 首次渲染
      renderMetrics();
      applyFilters();
    }
  }

  // 同步指示器渲染
  function updateSyncIndicator(status) {
    if (!el.syncIndicator) return;
    el.syncIndicator.className = 'sync-indicator ' + (status || 'idle');
    if (status === 'syncing') el.syncStatusText.innerText = '正在云端同步...';
    else if (status === 'synced') el.syncStatusText.innerText = '云端实时已对齐';
    else if (status === 'offline') el.syncStatusText.innerText = '离线/本地存储';
    else if (status === 'error') el.syncStatusText.innerText = '同步错误';
    else el.syncStatusText.innerText = '就绪';
  }

  // 渲染 KPI 统计指标
  function renderMetrics() {
    if (!window.syncService) return;
    const metrics = window.syncService.getMetrics();
    if (el.statTotalLeads) el.statTotalLeads.innerText = metrics.total;
    if (el.statTier1Count) el.statTier1Count.innerText = metrics.tier1;
    if (el.statActiveChannels) el.statActiveChannels.innerText = metrics.channelsCount;
    if (el.statPendingAction) el.statPendingAction.innerText = metrics.tier1 + metrics.tier2;
  }

  // 绑定模态框基础显示与关闭事件
  function bindModalEvents() {
    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close');
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('active');
      });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
        }
      });
    });

    if (el.btnOpenIngestModal) {
      el.btnOpenIngestModal.addEventListener('click', () => {
        el.modalIngest.classList.add('active');
      });
    }

    if (el.btnOpenSettings) {
      el.btnOpenSettings.addEventListener('click', () => {
        if (window.jevEngine && el.settingApiKey) {
          el.settingApiKey.value = window.jevEngine.apiKey || '';
        }
        el.modalSettings.classList.add('active');
      });
    }

    if (el.btnSyncNow) {
      el.btnSyncNow.addEventListener('click', async () => {
        showToast('正在向云端拉取并双向合并线索...', 'info');
        if (window.syncService) {
          await window.syncService.syncWithCloud();
          showToast('全网线索资产同步完成！', 'success');
        }
      });
    }

    if (el.syncIndicator) {
      el.syncIndicator.addEventListener('click', () => {
        if (window.syncService) window.syncService.syncWithCloud();
      });
    }

    // 复制代码按钮
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-copy');
        const target = document.getElementById(targetId);
        if (target) {
          navigator.clipboard.writeText(target.innerText).then(() => {
            showToast('已复制到剪贴板', 'success');
          });
        }
      });
    });
  }

  // 筛选与搜索事件绑定
  function bindFilterEvents() {
    const triggerFilter = () => applyFilters();
    if (el.searchInput) el.searchInput.addEventListener('input', triggerFilter);
    if (el.filterChannel) el.filterChannel.addEventListener('change', triggerFilter);
    if (el.filterTier) el.filterTier.addEventListener('change', triggerFilter);
    if (el.filterPersona) el.filterPersona.addEventListener('change', triggerFilter);

    if (el.btnResetFilters) {
      el.btnResetFilters.addEventListener('click', () => {
        if (el.searchInput) el.searchInput.value = '';
        if (el.filterChannel) el.filterChannel.value = 'ALL';
        if (el.filterTier) el.filterTier.value = 'ALL';
        if (el.filterPersona) el.filterPersona.value = 'ALL';
        applyFilters();
      });
    }

    if (el.btnExportCsv) {
      el.btnExportCsv.addEventListener('click', exportCurrentViewToCSV);
    }
  }

  // 应用筛选并重新渲染表格
  function applyFilters() {
    if (!window.syncService) return;
    const allLeads = window.syncService.getAllLeads();
    const query = (el.searchInput?.value || '').trim().toLowerCase();
    const channelFilter = el.filterChannel?.value || 'ALL';
    const tierFilter = el.filterTier?.value || 'ALL';
    const personaFilter = el.filterPersona?.value || 'ALL';

    currentFilteredLeads = allLeads.filter(lead => {
      // 1. 渠道过滤
      if (channelFilter !== 'ALL') {
        const ch = (lead.channel_source || lead.channel || '').trim();
        if (!ch.includes(channelFilter)) return false;
      }

      // 2. 意图分级过滤
      const tier = lead.jev_analysis?.tier || 'TIER_3_EXPLORATORY';
      if (tierFilter !== 'ALL' && tier !== tierFilter) {
        return false;
      }

      // 3. 画像过滤
      const persona = window.InquiryResponder ? window.InquiryResponder.classifyPersona(lead) : '';
      if (personaFilter !== 'ALL' && persona !== personaFilter) {
        return false;
      }

      // 4. 关键词全文检索
      if (query) {
        const full = (
          (lead.name || '') + ' ' +
          (lead.company || '') + ' ' +
          (lead.email || '') + ' ' +
          (lead.job_title || '') + ' ' +
          (lead.country || '') + ' ' +
          (lead.raw_text || '') + ' ' +
          (lead.raw_requirements || '') + ' ' +
          JSON.stringify(lead.technical_parameters || lead.detected_params || {}) + ' ' +
          JSON.stringify(lead.fields_filled || {})
        ).toLowerCase();

        if (!full.includes(query)) return false;
      }

      return true;
    });

    renderTable(currentFilteredLeads);
    if (el.tableCountSummary) {
      el.tableCountSummary.innerText = `显示 ${currentFilteredLeads.length} / ${allLeads.length} 条线索`;
    }
  }

  // 渲染表格行
  function renderTable(leads) {
    if (!el.leadsTableBody) return;
    el.leadsTableBody.innerHTML = '';

    if (leads.length === 0) {
      el.leadsTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 48px; color: var(--text-muted);">
            <div style="font-size: 24px; margin-bottom: 8px;">📭</div>
            <div>没有符合筛选条件的线索资产</div>
          </td>
        </tr>
      `;
      return;
    }

    leads.forEach((lead, index) => {
      const tr = document.createElement('tr');

      // 时间
      const timeStr = lead.submitted_at || (lead.created_at ? lead.created_at.replace('T', ' ').slice(0, 16) : '未知时间');

      // 客户信息
      let rawName = lead.name || '';
      let cleanName = rawName.replace(/^(?:(?:IPET)?\s*(?:客户留言|客户姓名|客户|Contact|Name|Full Name|姓名)[:：\s]*)+/gi, '').trim() || '潜在客户';
      let company = lead.company || 'Stealth / 未填写';
      let job = lead.job_title || '';
      let email = lead.email || '无邮箱留资';
      let country = lead.country ? `[${lead.country}]` : '';

      // 渠道胶囊样式
      const channel = lead.channel_source || lead.channel || '未知渠道';
      let pillClass = 'pill-website';
      if (channel.includes('LinkedIn')) pillClass = 'pill-linkedin';
      else if (channel.includes('展会') || channel.includes('DroneX')) pillClass = 'pill-expo';
      else if (channel.includes('供应商')) pillClass = 'pill-supplier';
      else if (channel.includes('Google')) pillClass = 'pill-google';
      else if (channel.includes('WhatsApp') || channel.includes('初聊')) pillClass = 'pill-direct';

      const scenario = lead.channel_scenario || lead.scenario || '动力系统选型匹配';

      // 提取技术参数徽章
      const p = lead.technical_parameters || lead.detected_params || {};
      const paramBadges = [];
      if (p.uav_type) paramBadges.push(`<span class="param-badge highlight">${escapeHtml(p.uav_type)}</span>`);
      if (p.mtow) paramBadges.push(`<span class="param-badge highlight">${escapeHtml(p.mtow)}</span>`);
      if (p.voltage) paramBadges.push(`<span class="param-badge">${escapeHtml(p.voltage)}</span>`);
      if (p.payload) paramBadges.push(`<span class="param-badge">${escapeHtml(p.payload)}</span>`);
      if (p.thrust) paramBadges.push(`<span class="param-badge">${escapeHtml(p.thrust)}</span>`);
      if (p.stage) paramBadges.push(`<span class="param-badge">${escapeHtml(p.stage)}</span>`);

      // Jev 研判分级
      const jev = lead.jev_analysis || {};
      const tier = jev.tier || 'TIER_3_EXPLORATORY';
      let tierClass = 'tier-3';
      let tierLabel = 'Tier 3 探讨';
      if (tier === 'TIER_1_READY_RFQ') {
        tierClass = 'tier-1';
        tierLabel = 'Tier 1 RFQ';
      } else if (tier === 'TIER_2_TECH_SPEC') {
        tierClass = 'tier-2';
        tierLabel = 'Tier 2 规格';
      } else if (tier === 'DISQUALIFIED') {
        tierClass = 'tier-disqualified';
        tierLabel = '红线回绝';
      }

      const score = (typeof jev.maturity_score === 'number') ? jev.maturity_score.toFixed(1) : '2.0';
      const scorePct = Math.min(100, Math.max(0, ((score - 1.0) / 4.0) * 100));
      let scoreColor = '#38bdf8';
      if (score >= 4.0) scoreColor = '#10b981';
      else if (score < 2.0) scoreColor = '#ef4444';

      // 客户画像
      const persona = window.InquiryResponder ? window.InquiryResponder.classifyPersona(lead) : 'TYPE_C_LOW_INFO';
      let personaLabel = '商业整机 OEM';
      if (persona === 'TYPE_A_ACADEMIC') personaLabel = '高校/科研';
      else if (persona === 'TYPE_S_SUPPLIER') personaLabel = '外协供应链';
      else if (persona === 'TYPE_D_DISQUALIFIED') personaLabel = '误触红线';
      else if (persona === 'TYPE_C_LOW_INFO') personaLabel = '初级意向';

      // 状态
      const status = lead.status || 'NEW';
      let statusBadge = `<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(56, 189, 248, 0.15); color: #38bdf8;">NEW</span>`;
      if (status === 'CONTACTED') statusBadge = `<span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(16, 185, 129, 0.15); color: #34d399;">已跟进</span>`;

      tr.innerHTML = `
        <td style="color: var(--text-muted); font-size: 12px; font-family: var(--font-mono);">
          ${timeStr}
        </td>
        <td>
          <div class="client-profile">
            <div class="client-name-row">
              <span class="client-name">${escapeHtml(cleanName)}</span>
              ${job ? `<span class="client-job">${escapeHtml(job)}</span>` : ''}
              ${country ? `<span style="font-size: 11px; color: var(--text-muted);">${escapeHtml(country)}</span>` : ''}
            </div>
            <div class="client-comp-row">
              <span>🏢 ${escapeHtml(company)}</span>
            </div>
            <div class="client-email">✉️ ${escapeHtml(email)}</div>
          </div>
        </td>
        <td>
          <div>
            <span class="channel-pill ${pillClass}">${escapeHtml(channel)}</span>
            <span class="channel-scenario">${escapeHtml(scenario)}</span>
          </div>
        </td>
        <td>
          <div class="params-cloud">
            ${paramBadges.length > 0 ? paramBadges.join('') : '<span style="color: var(--text-muted); font-size: 11px;">未明确具体参数</span>'}
          </div>
        </td>
        <td>
          <div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="tier-badge ${tierClass}">${tierLabel}</span>
              <span style="font-size: 11px; color: var(--text-secondary);">${personaLabel}</span>
            </div>
            <div class="score-meter">
              <div class="score-bar-bg">
                <div class="score-bar-fill" style="width: ${scorePct}%; background: ${scoreColor};"></div>
              </div>
              <span class="score-val" style="color: ${scoreColor};">${score}</span>
            </div>
          </div>
        </td>
        <td>
          ${statusBadge}
        </td>
        <td style="text-align: right;">
          <div class="action-buttons" style="justify-content: flex-end;">
            <button class="btn btn-primary btn-sm btn-action-email" data-id="${lead.id}" title="生成针对该客户的专属英文跟进邮件">
              📧 跟进
            </button>
            <button class="btn btn-secondary btn-sm btn-action-detail" data-id="${lead.id}" title="查看完整无损表单与 AI 审计">
              🔍 审计
            </button>
            <button class="btn btn-outline btn-sm btn-action-delete" data-id="${lead.id}" title="作废或删除" style="color: var(--accent-rose);">
              🗑️
            </button>
          </div>
        </td>
      `;

      el.leadsTableBody.appendChild(tr);
    });

    // 绑定表格行内操作按钮
    el.leadsTableBody.querySelectorAll('.btn-action-email').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openEmailModal(id);
      });
    });

    el.leadsTableBody.querySelectorAll('.btn-action-detail').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openDetailModal(id);
      });
    });

    el.leadsTableBody.querySelectorAll('.btn-action-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (confirm('确认作废或删除此条线索资产？此操作将同步至云端。')) {
          if (window.syncService) {
            await window.syncService.deleteLead(id);
            showToast('线索已删除并从云端同步', 'info');
          }
        }
      });
    });
  }

  // 动态渲染渠道预设表单字段
  function renderPresetFormFields(channelKey) {
    if (!el.presetFormFields) return;
    el.presetFormFields.innerHTML = '';

    const defaultFields = [
      { key: 'name', label: '客户姓名', placeholder: '如 David Miller', required: true },
      { key: 'company', label: '企业/机构名称', placeholder: '如 AeroSystems Defense Inc', required: true },
      { key: 'email', label: '工作电子邮箱', placeholder: '如 d.miller@aerosystems-defense.com', required: true },
      { key: 'phone', label: '联系电话 / WhatsApp', placeholder: '+1 (555) 234-5678' },
      { key: 'country', label: '国家/地区', placeholder: '如 United States' },
      { key: 'job_title', label: '职务头衔', placeholder: '如 Chief Propulsion Engineer' },
      { key: 'uav_type', label: '意向飞行器形态', placeholder: '如 共轴八旋翼 (Coaxial X8) / VTOL / 多旋翼' },
      { key: 'mtow', label: '最大起飞重量 (MTOW)', placeholder: '如 65kg / 45kg MTOW' },
      { key: 'voltage', label: '动力母线工作电压', placeholder: '如 14S / 18S / 60-78V' },
      { key: 'payload', label: '任务有效载荷', placeholder: '如 15kg payload' },
      { key: 'stage', label: '研发进度阶段', placeholder: '如 Prototype Bench Testing / 试飞阶段' },
      { key: 'requirements', label: '详细诉求与项目备忘', placeholder: '需要推力台架曲线、3D STEP 模型及样品报价...', fullWidth: true, isTextarea: true }
    ];

    defaultFields.forEach(f => {
      const grp = document.createElement('div');
      grp.className = `form-group ${f.fullWidth ? 'full-width' : ''}`;
      grp.innerHTML = `
        <label class="form-label">${f.label} ${f.required ? '<span style="color:var(--accent-rose)">*</span>' : ''}</label>
        ${f.isTextarea ? 
          `<textarea class="form-textarea" data-field="${f.key}" placeholder="${f.placeholder}"></textarea>` : 
          `<input type="text" class="form-input" data-field="${f.key}" placeholder="${f.placeholder}">`
        }
      `;
      el.presetFormFields.appendChild(grp);
    });
  }

  // 绑定入库模态框内部交互
  function bindIngestEvents() {
    // 选项卡切换
    document.querySelectorAll('#modalIngest .tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#modalIngest .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('#modalIngest .tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        const panel = document.getElementById(tabId);
        if (panel) panel.classList.add('active');
      });
    });

    // 预设渠道下拉框切换
    if (el.presetChannelSelect) {
      el.presetChannelSelect.addEventListener('change', (e) => {
        renderPresetFormFields(e.target.value);
      });
    }

    // 提交预设表单
    if (el.btnSubmitPresetForm) {
      el.btnSubmitPresetForm.addEventListener('click', async () => {
        const formData = {};
        el.presetFormFields.querySelectorAll('[data-field]').forEach(input => {
          const val = input.value.trim();
          if (val) formData[input.getAttribute('data-field')] = val;
        });

        if (!formData.name && !formData.email) {
          showToast('请至少填写客户姓名或工作邮箱', 'warn');
          return;
        }

        const selectedChannelText = el.presetChannelSelect.options[el.presetChannelSelect.selectedIndex].text;
        const normalized = window.Normalizer ? window.Normalizer.normalize(formData, selectedChannelText) : formData;

        showToast('正在进行 TypeSafe Jev 意图研判与云端入库...', 'info');
        const res = await window.syncService.ingestLead(normalized);

        if (res.duplicate) {
          showToast(`查重提示: 已存在相同线索 (${res.reason})`, 'warn');
        } else {
          showToast('🎉 新线索成功归一化并存入资产库！', 'success');
          el.modalIngest.classList.remove('active');
        }
      });
    }

    // 提交自由文本 NLP
    if (el.btnSubmitFreeText) {
      el.btnSubmitFreeText.addEventListener('click', async () => {
        const text = (el.freeTextInput?.value || '').trim();
        if (!text) {
          showToast('请粘贴需要解析的邮件或对话文本', 'warn');
          return;
        }

        const channelHint = el.freeTextChannel?.value.trim() || '销售初聊 / WhatsApp 沟通记录';
        const normalized = window.Normalizer.parseFreeText(text, channelHint);

        showToast('正在进行 NLP 提取与 Jev 强类型研判...', 'info');
        const res = await window.syncService.ingestLead(normalized);

        if (res.duplicate) {
          showToast(`查重提示: 已存在相同线索 (${res.reason})`, 'warn');
        } else {
          showToast('🎉 文本实体提取完成并存入资产库！', 'success');
          el.freeTextInput.value = '';
          el.modalIngest.classList.remove('active');
        }
      });
    }

    // CSV 解析与批量导入
    let parsedCsvLeads = [];
    const handleCsvText = (csvString) => {
      parsedCsvLeads = window.Normalizer.parseCSV(csvString, 'CSV 批量导入');
      if (parsedCsvLeads.length > 0) {
        el.csvPreviewArea.style.display = 'flex';
        el.csvRowCount.innerText = parsedCsvLeads.length;
        el.csvPreviewTable.innerHTML = parsedCsvLeads.slice(0, 5).map(l => `
          <div style="display: flex; gap: 12px; margin-bottom: 4px; border-bottom: 1px solid rgba(55,65,81,0.5); padding-bottom: 2px;">
            <span style="font-weight: 600; width: 140px;">${escapeHtml(l.name || '未命名')}</span>
            <span style="width: 160px; color: var(--accent-sky);">${escapeHtml(l.company || '未知企业')}</span>
            <span style="color: var(--text-muted);">${escapeHtml(l.email || '')}</span>
          </div>
        `).join('') + (parsedCsvLeads.length > 5 ? `<div style="color: var(--text-muted); font-size: 11px;">... 还有 ${parsedCsvLeads.length - 5} 条</div>` : '');
      }
    };

    if (el.csvTextInput) {
      el.csvTextInput.addEventListener('input', (e) => {
        handleCsvText(e.target.value);
      });
    }

    if (el.csvFileInput) {
      el.csvFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => handleCsvText(evt.target.result);
          reader.readAsText(file);
        }
      });
    }

    if (el.btnSubmitCSV) {
      el.btnSubmitCSV.addEventListener('click', async () => {
        if (!parsedCsvLeads || parsedCsvLeads.length === 0) {
          showToast('请先选择或粘贴有效的 CSV 数据', 'warn');
          return;
        }

        showToast(`正在批量入库 ${parsedCsvLeads.length} 条线索并触发 Jev 研判...`, 'info');
        const skipDups = el.csvSkipDuplicates.checked;
        const res = await window.syncService.ingestBatch(parsedCsvLeads, { skipDuplicates: skipDups });

        showToast(`批量入库完成！成功入库 ${res.imported} 条，跳过重复 ${res.duplicates} 条。`, 'success');
        el.csvFileInput.value = '';
        el.csvTextInput.value = '';
        el.csvPreviewArea.style.display = 'none';
        parsedCsvLeads = [];
        el.modalIngest.classList.remove('active');
      });
    }
  }

  // 跟进邮件生成器交互
  function openEmailModal(leadId) {
    if (!window.syncService || !window.InquiryResponder) return;
    const lead = window.syncService.getAllLeads().find(l => l.id === leadId);
    if (!lead) return;

    currentEmailLead = lead;
    currentEmailAnalysis = window.InquiryResponder.analyzeLead(lead);

    // 渲染头部
    el.emailModalClientTitle.innerText = `${currentEmailAnalysis.callName} (${currentEmailAnalysis.cleanEnglishCompany})`;
    el.emailModalClientSub.innerText = `${currentEmailAnalysis.industryProfile} · ${currentEmailAnalysis.product}`;

    let personaTag = `<span class="tier-badge tier-1">商业无人机 OEM</span>`;
    if (currentEmailAnalysis.persona === 'TYPE_A_ACADEMIC') personaTag = `<span class="tier-badge tier-2">高校/科研团队</span>`;
    else if (currentEmailAnalysis.persona === 'TYPE_S_SUPPLIER') personaTag = `<span class="tier-badge tier-3">外协微电子/加工供应商</span>`;
    else if (currentEmailAnalysis.persona === 'TYPE_D_DISQUALIFIED') personaTag = `<span class="tier-badge tier-disqualified">误触红线/非业务回绝</span>`;
    el.emailModalPersonaBadge.innerHTML = personaTag;

    // 获取适用的 3 种策略切角
    const strategies = window.InquiryResponder.getStrategies(currentEmailAnalysis);
    renderEmailStrategies(strategies);

    el.modalEmail.classList.add('active');
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
    const body = window.InquiryResponder.generateCustomEmailBody(currentEmailAnalysis, selectedStrategyId, subjectText);
    if (el.emailBodyTextarea) {
      el.emailBodyTextarea.value = body;
    }
  }

  function bindEmailEvents() {
    if (el.btnCopyEmail) {
      el.btnCopyEmail.addEventListener('click', () => {
        const text = `Subject: ${selectedSubjectText}\n\n${el.emailBodyTextarea.value}`;
        navigator.clipboard.writeText(text).then(() => {
          showToast('✅ 纯英文跟进邮件（包含主题行）已复制到剪贴板！', 'success');
        });
      });
    }

    if (el.btnOpenMailto) {
      el.btnOpenMailto.addEventListener('click', () => {
        if (!currentEmailLead || !currentEmailLead.email) {
          showToast('该线索无有效邮箱', 'warn');
          return;
        }
        const to = currentEmailLead.email;
        const subj = encodeURIComponent(selectedSubjectText);
        const body = encodeURIComponent(el.emailBodyTextarea.value);
        window.open(`mailto:${to}?subject=${subj}&body=${body}`, '_blank');
      });
    }
  }

  // 审计与详情模态框
  function openDetailModal(leadId) {
    if (!window.syncService) return;
    const lead = window.syncService.getAllLeads().find(l => l.id === leadId);
    if (!lead || !el.leadDetailContent) return;

    const jev = lead.jev_analysis || {};
    const p = lead.technical_parameters || lead.detected_params || {};
    const fields = lead.fields_filled || {};

    el.leadDetailContent.innerHTML = `
      <!-- 基础卡片 -->
      <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 14px 18px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h4 style="font-size: 16px; color: var(--text-primary);">${escapeHtml(lead.name || '未命名')}</h4>
            <div style="color: var(--text-secondary); font-size: 13px; margin-top: 2px;">
              ${escapeHtml(lead.job_title || '')} · <strong>${escapeHtml(lead.company || '未知企业')}</strong>
            </div>
            <div style="font-family: var(--font-mono); font-size: 12px; color: var(--accent-sky); margin-top: 4px;">
              ✉️ ${escapeHtml(lead.email || '无邮箱')} ${lead.phone ? `· 📞 ${escapeHtml(lead.phone)}` : ''}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">ID: ${lead.id}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">接收时间: ${lead.submitted_at || lead.created_at || ''}</div>
          </div>
        </div>
      </div>

      <!-- TypeSafe Jev 审计报告 -->
      <div style="border: 1px solid rgba(56, 189, 248, 0.3); background: rgba(14, 165, 233, 0.05); border-radius: var(--radius-sm); padding: 14px 18px;">
        <h5 style="color: var(--accent-sky); font-size: 13px; font-weight: 600; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
          <span>🤖</span> TypeSafe Jev (System One) 官方强类型审计报告
        </h5>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 12px;">
          <div><strong>分级判定:</strong> <span class="tier-badge ${jev.tier === 'TIER_1_READY_RFQ' ? 'tier-1' : 'tier-3'}">${jev.tier || 'TIER_3'}</span></div>
          <div><strong>商业成熟度打分:</strong> <span style="font-family: var(--font-mono); color: var(--accent-green); font-weight: 600;">${jev.maturity_score || '--'} / 5.0</span></div>
          <div><strong>置信度:</strong> <span style="font-family: var(--font-mono);">${(jev.confidence ? (jev.confidence * 100).toFixed(0) : '95')}%</span></div>
          <div><strong>模型版本:</strong> <span style="font-family: var(--font-mono); color: var(--text-muted);">${jev.model || 'jev-latest'}</span></div>
          <div><strong>研判源:</strong> <span style="font-family: var(--font-mono); color: var(--accent-sky);">${jev.source || 'jev_calibrated'}</span></div>
          <div><strong>防宠物误触判定:</strong> <span>${jev.has_pet_confusion ? '⚠️ 存在宠物玩具歧义' : '✅ 正常航天工业'}</span></div>
        </div>
        <div style="margin-top: 10px; font-size: 12px; color: var(--text-primary); background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 4px;">
          <strong>建议跟进动作:</strong> ${escapeHtml(jev.recommended_action || '根据标准选型表进行推进')}
        </div>
      </div>

      <!-- 提取的飞行技术参数 -->
      <div>
        <h5 style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">📐 结构化提取工程参数:</h5>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; background: var(--bg-secondary); padding: 12px; border-radius: var(--radius-sm); font-size: 12px;">
          <div><strong>飞行器形态:</strong> ${escapeHtml(p.uav_type || '未明确')}</div>
          <div><strong>起飞重量 (MTOW):</strong> ${escapeHtml(p.mtow || '未明确')}</div>
          <div><strong>工作母线电压:</strong> ${escapeHtml(p.voltage || '未明确')}</div>
          <div><strong>有效任务载荷:</strong> ${escapeHtml(p.payload || '未明确')}</div>
          <div><strong>推力要求:</strong> ${escapeHtml(p.thrust || '未明确')}</div>
          <div><strong>研发推进阶段:</strong> ${escapeHtml(p.stage || '未明确')}</div>
        </div>
      </div>

      <!-- 100% 无损留存的原始表单字段 -->
      <div>
        <h5 style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">📋 无损留存原始表单键值 (Fields Filled):</h5>
        <div style="max-height: 180px; overflow-y: auto; background: #0d1117; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 10px 14px; font-family: var(--font-mono); font-size: 12px;">
          ${Object.entries(fields).map(([k, v]) => `
            <div style="margin-bottom: 6px; border-bottom: 1px solid rgba(55,65,81,0.3); padding-bottom: 4px;">
              <span style="color: var(--accent-sky);">${escapeHtml(k)}:</span>
              <span style="color: #e5e7eb; margin-left: 6px;">${escapeHtml(String(v))}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    el.modalDetail.classList.add('active');
  }

  // 设置模态框交互
  function bindSettingsEvents() {
    if (el.btnSaveSettings) {
      el.btnSaveSettings.addEventListener('click', () => {
        const key = el.settingApiKey?.value.trim();
        if (window.jevEngine) {
          window.jevEngine.setApiKey(key);
          showToast('TypeSafe API Key 配置已保存！', 'success');
        }
        el.modalSettings.classList.remove('active');
      });
    }

    if (el.btnTestJev) {
      el.btnTestJev.addEventListener('click', async () => {
        showToast('正在向 TypeSafe Jev 发送试探请求...', 'info');
        try {
          const res = await window.jevEngine.scoreLeadIntent('65kg MTOW heavy lift VTOL propulsion RFQ');
          if (res && res.tier) {
            showToast(`✅ Jev 研判成功! 输出: ${res.tier}, 成熟度: ${res.maturity_score} (源: ${res.source})`, 'success');
          } else {
            showToast('Jev 响应异常，请检查网络或密钥', 'warn');
          }
        } catch (e) {
          showToast(`Jev 测试失败: ${e.message}`, 'error');
        }
      });
    }
  }

  // 导出当前表格为 CSV
  function exportCurrentViewToCSV() {
    if (!currentFilteredLeads || currentFilteredLeads.length === 0) {
      showToast('当前视图无可用线索', 'warn');
      return;
    }

    const headers = ['ID', 'Submitted At', 'Client Name', 'Company', 'Job Title', 'Work Email', 'Phone', 'Country', 'Channel', 'Scenario', 'UAV Type', 'MTOW', 'Voltage', 'Stage', 'Jev Tier', 'Maturity Score'];
    const rows = currentFilteredLeads.map(l => {
      const p = l.technical_parameters || l.detected_params || {};
      const jev = l.jev_analysis || {};
      return [
        l.id,
        l.submitted_at || '',
        l.name || '',
        l.company || '',
        l.job_title || '',
        l.email || '',
        l.phone || '',
        l.country || '',
        l.channel_source || l.channel || '',
        l.channel_scenario || '',
        p.uav_type || '',
        p.mtow || '',
        p.voltage || '',
        p.stage || '',
        jev.tier || '',
        jev.maturity_score || ''
      ].map(val => `"${String(val).replace(/"/g, '""')}"`);
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ipet_lead_assets_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    showToast(`已导出 ${currentFilteredLeads.length} 条线索到 CSV 文件`, 'success');
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
