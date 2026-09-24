/**
 * IPET LEAD ASSETS HUB · TypeSafe Jev (System One) 强类型研判引擎
 * 
 * 特性：
 * 1. 强类型输出 (Typed Judgments: Choice, Noul, Score)
 * 2. 毫秒级极速研判 (System One 架构，无冗余文本生成)
 * 3. 双模自适应：配置 TYPESAFE_API_KEY 时直连 TypeSafe API，未配置时启用 IPET 领域校准推理器
 * 4. 内置动态缓存与自学习记忆注入
 */

const DEFAULT_TYPESAFE_API_KEY = "apikey_221812bfd37da738469ea9082cbc951f69d5_64b5766d3cdf62618ec507194eeb4126619aea698f0097cebf4407a2a16b3621";

class JevEngine {
  constructor() {
    const localKey = typeof localStorage !== 'undefined' ? localStorage.getItem('TYPESAFE_API_KEY') : null;
    this.apiKey = (typeof window !== 'undefined' && window.TYPESAFE_API_KEY) || 
                  (typeof process !== 'undefined' && process.env && process.env.TYPESAFE_API_KEY) || 
                  localKey || 
                  DEFAULT_TYPESAFE_API_KEY;
    this.endpoint = "https://api.typesafe.ai/v1/systemone";
    this.isLive = !!this.apiKey;
    this.cache = {
      titles: {},
      companies: {},
      leads: {}
    };
    
    this.loadKnowledgeBase();
  }

  loadKnowledgeBase() {
    try {
      if (typeof window !== 'undefined' && window.ACCOUNT_KNOWLEDGE && window.ACCOUNT_KNOWLEDGE.cached_judgments) {
        this.cache.titles = { ...window.ACCOUNT_KNOWLEDGE.cached_judgments.titles };
        this.cache.companies = { ...window.ACCOUNT_KNOWLEDGE.cached_judgments.companies };
      }
    } catch (e) {
      console.warn("Knowledge base init warning:", e);
    }
  }

  setApiKey(key) {
    this.apiKey = key;
    this.isLive = !!key;
    if (typeof localStorage !== 'undefined') {
      if (key) {
        localStorage.setItem('TYPESAFE_API_KEY', key);
      } else {
        localStorage.removeItem('TYPESAFE_API_KEY');
      }
    }
  }

  /**
   * 职位头衔语义消歧与决策链角色打标 (Primitive: Choice)
   * 选项: TECHNICAL_EVALUATOR | COMMERCIAL_BUYER | EXECUTIVE_DECISION_MAKER | IRRELEVANT_NOISE
   */
  async judgeJobTitle(title) {
    if (!title) return { role: "IRRELEVANT_NOISE", confidence: 1.0, source: "fallback" };
    
    // 1. 本地缓存直出 (0ms)
    if (this.cache.titles[title]) {
      return { ...this.cache.titles[title], source: "knowledge_cache" };
    }

    // 2. 尝试调用真实 Jev System One API (浏览器请求 /api/jev，Node 环境直连代理)
    try {
      const liveRes = await this._invokeLiveProxy({
        action: "judge_title",
        title: title
      });
      if (liveRes && liveRes.success && liveRes.role) {
        const result = {
          role: liveRes.role,
          confidence: liveRes.confidence || 0.95,
          probabilities: liveRes.probabilities,
          source: "jev_live",
          model: liveRes.model
        };
        this.cache.titles[title] = result;
        return result;
      }
    } catch (err) {
      // 静默降级
    }

    // 3. 本地领域校准引擎兜底 (Zero-Latency)
    const calibrated = this._calibratedTitleJudge(title);
    this.cache.titles[title] = calibrated;
    return calibrated;
  }

  /**
   * 目标企业行业与防宠物/防玩具研判 (Primitive: Noul)
   * 返回: 是否属于工业无人机/相关设备产业链的目标概率 (0~1)
   */
  async judgeCompanyTarget(companyName, industry = "") {
    const key = `${companyName}__${industry}`;
    if (this.cache.companies[key]) {
      return { ...this.cache.companies[key], source: "knowledge_cache" };
    }

    try {
      const liveRes = await this._invokeLiveProxy({
        action: "judge_company",
        company: companyName,
        industry: industry
      });
      if (liveRes && liveRes.success && typeof liveRes.is_target === 'boolean') {
        const result = {
          is_target: liveRes.is_target,
          probability: liveRes.probability,
          source: "jev_live",
          model: liveRes.model
        };
        this.cache.companies[key] = result;
        return result;
      }
    } catch (e) {
      // 优雅降级
    }

    const calibrated = this._calibratedCompanyJudge(companyName, industry);
    this.cache.companies[key] = calibrated;
    return calibrated;
  }

  /**
   * 原生表单线索意图分级与成熟度打分 (Primitive: Choice + Score + Noul)
   * 优先调用 /api/jev 直连 TypeSafe 官方 System One 大模型 API
   */
  async scoreLeadIntent(leadText, email = "", company = "", jobTitle = "") {
    const cleanText = (leadText || "").trim();
    if (!cleanText && !email) {
      return {
        tier: "TIER_3_EXPLORATORY",
        maturity_score: 1.5,
        has_pet_confusion: false,
        confidence: 0.90,
        source: "default"
      };
    }

    const cacheKey = `${cleanText}__${email}__${company}`;
    if (this.cache.leads[cacheKey]) {
      return { ...this.cache.leads[cacheKey], source: "knowledge_cache" };
    }

    // 1. 优先调用真实 TypeSafe Jev System One 大模型 API (通过 /api/jev)
    try {
      const liveRes = await this._invokeLiveProxy({
        action: "score_lead",
        leadText: cleanText,
        email: email,
        company: company,
        job_title: jobTitle
      });
      if (liveRes && liveRes.success && liveRes.tier) {
        const finalRes = {
          tier: liveRes.tier,
          maturity_score: liveRes.maturity_score,
          has_pet_confusion: liveRes.has_pet_confusion,
          confidence: liveRes.confidence || 0.95,
          recommended_action: liveRes.recommended_action,
          probabilities: liveRes.probabilities || {},
          source: "jev_live",
          model: liveRes.model || "jev-latest",
          usage: liveRes.usage || {}
        };
        this.cache.leads[cacheKey] = finalRes;
        return finalRes;
      }
    } catch (err) {
      console.warn("[JevEngine] /api/jev live call failed, falling back to calibrated inference:", err.message);
    }

    // 2. 本地校准推理兜底 (保底 0ms 且离线可用)
    const fallbackRes = this._calibratedLeadJudge(cleanText, email);
    this.cache.leads[cacheKey] = fallbackRes;
    return fallbackRes;
  }

  // --- 内部：统一代理调用接口 (浏览器环境请求 /api/jev，Node 环境支持直调) ---
  async _invokeLiveProxy(payload) {
    if (typeof window !== 'undefined' && window.location && window.location.origin && typeof fetch !== 'undefined') {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller ? setTimeout(() => controller.abort(), 9500) : null;
      try {
        const res = await fetch('/api/jev', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller ? controller.signal : undefined
        });
        if (timeoutId) clearTimeout(timeoutId);
        if (res.ok) {
          return await res.json();
        }
      } catch (e) {
        if (timeoutId) clearTimeout(timeoutId);
        throw e;
      }
    }

    if (typeof process !== 'undefined') {
      try {
        let handler = null;
        try {
          const path = require('path');
          const apiPath = path.resolve(__dirname, '../api/jev.js');
          handler = require(apiPath);
        } catch (e1) {
          try {
            handler = require('./api/jev.js');
          } catch (e2) {}
        }

        if (handler) {
          return new Promise((resolve, reject) => {
            const req = { method: 'POST', body: payload };
            const res = {
              statusCode: 200,
              setHeader() {},
              status(code) { this.statusCode = code; return this; },
              json(data) { resolve(data); }
            };
            handler(req, res).catch(reject);
          });
        }
      } catch (e) {}
    }

    throw new Error('No live proxy available in current environment');
  }

  // --- 内部：IPET 领域校准本地推理器 (Zero-Latency Fallback) ---
  _calibratedTitleJudge(title) {
    const t = title.toLowerCase();

    // 1. 拍板决策人 (Executive Decision Maker)
    if (t.includes("cto") || t.includes("chief") || t.includes("vp") || t.includes("vice president") || 
        t.includes("head of engineering") || t.includes("director of engineering") || t.includes("founder") || t.includes("owner")) {
      return { role: "EXECUTIVE_DECISION_MAKER", confidence: 0.98, source: "jev_calibrated" };
    }

    // 2. 商业与供应链采购 (Commercial Buyer)
    if (t.includes("procurement") || t.includes("purchasing") || t.includes("supply chain") || 
        t.includes("sourcing") || t.includes("buyer")) {
      return { role: "COMMERCIAL_BUYER", confidence: 0.95, source: "jev_calibrated" };
    }

    // 3. 技术评估与测试研发 (Technical Evaluator)
    if (t.includes("uav") || t.includes("propulsion") || t.includes("powertrain") || t.includes("drone") ||
        t.includes("aerospace") || t.includes("aero") || t.includes("flight test") || t.includes("avionics") ||
        t.includes("hardware") || t.includes("structural") || t.includes("mechanical") || t.includes("robotics") ||
        t.includes("fleet") || t.includes("pilot") || t.includes("systems engineer")) {
      return { role: "TECHNICAL_EVALUATOR", confidence: 0.94, source: "jev_calibrated" };
    }

    // 4. 杂音与无关人员 (Irrelevant Noise)
    if (t.includes("sales") || t.includes("marketing") || t.includes("account executive") ||
        t.includes("audio") || t.includes("music") || t.includes("civil") || t.includes("human resources") ||
        t.includes("hr") || t.includes("teacher") || t.includes("recruiter") || t.includes("student")) {
      return { role: "IRRELEVANT_NOISE", confidence: 0.99, source: "jev_calibrated" };
    }

    return { role: "IRRELEVANT_NOISE", confidence: 0.65, source: "jev_calibrated" };
  }

  _calibratedCompanyJudge(name, industry) {
    const n = (name + " " + industry).toLowerCase().replace(/ipet/gi, "");
    
    // 宠物与玩具严防 (采用词边界正则，杜绝子串误杀)
    if (/\b(pet|pets|veterinary|vet|dog|dogs|cat|cats|puppy|toy|toys|plush)\b/i.test(n) || n.includes("宠物") || n.includes("猫粮") || n.includes("狗粮")) {
      return { is_target: false, probability: 0.02, source: "jev_calibrated" };
    }

    if (n.includes("aviation") || n.includes("aerospace") || n.includes("defense") || 
        n.includes("drone") || n.includes("uav") || n.includes("robotics") || n.includes("agriculture") ||
        n.includes("gremsy") || n.includes("gimbal") || n.includes("propulsion")) {
      return { is_target: true, probability: 0.98, source: "jev_calibrated" };
    }

    return { is_target: false, probability: 0.25, source: "jev_calibrated" };
  }

  _calibratedLeadJudge(text, email) {
    const t = text.toLowerCase();
    const e = (email || "").toLowerCase();

    // 剔除自身品牌词 IPET / ipetsystem，杜绝误伤
    const cleanT = t.replace(/ipet/gi, "");
    const cleanE = e.replace(/ipet/gi, "");

    // 真正的宠物/动物用品误触检测 (严格词边界匹配，严禁子串误伤)
    const hasPet = /\b(pet|pets|dog|dogs|cat|cats|puppy|kitten|collar|leash|veterinary|vet|toy|toys|plush)\b/i.test(cleanT) || 
                   cleanT.includes("宠物") || cleanT.includes("猫粮") || cleanT.includes("狗粮") ||
                   cleanE.includes("dog") || cleanE.includes("cat");

    if (hasPet) {
      return {
        tier: "DISQUALIFIED",
        maturity_score: 0.0,
        has_pet_confusion: true,
        confidence: 0.99,
        recommended_action: "宠物/玩具歧义误点！判定无效归档，并将其邮箱后缀与相关关键词追加至否定排除库。",
        source: "jev_calibrated"
      };
    }

    // Tier 1 明确工程参数、核心部件（电机/电调/螺旋桨）、整机匹配或知名行业整机/载荷制造商
    const isTier1Match = 
      /\b(thrust|evtol|vtol|gremsy|gimbal|payload|multirotor|drone|uav|powertrain|propulsion)\b/i.test(t) ||
      /\b(motor|esc|propeller|prop|cad|step|dyno|bench|rfq)\b/i.test(t) ||
      /\b(i7|i8)\b/i.test(t) ||
      /\b\d+\s*kg\b/i.test(t) ||
      t.includes("heavy lift") || t.includes("concept evaluation") ||
      t.includes("flight test") || t.includes("procurement") || t.includes("procuring") ||
      t.includes("booth") || t.includes("trade show") || t.includes("采购需求") || t.includes("动力系统");

    if (isTier1Match) {
      return {
        tier: "TIER_1_READY_RFQ",
        maturity_score: 4.8,
        has_pet_confusion: false,
        confidence: 0.96,
        recommended_action: "高价值紧急 OEM/研发商机！涉及工业无人机核心动力总成匹配，立即由工程团队发送专属推力台架曲线、选型建议与 3D STEP 下载链接。",
        source: "jev_calibrated"
      };
    }

    // Tier 2 白皮书与规格索取
    if (/\b(spec|specs|specification|whitepaper|catalog|catalogue|datasheet|manual)\b/i.test(t) || t.includes("技术规格") || t.includes("白皮书") || t.includes("数据手册")) {
      return {
        tier: "TIER_2_TECH_SPEC",
        maturity_score: 3.5,
        has_pet_confusion: false,
        confidence: 0.91,
        recommended_action: "技术资料索取！发送完整规格表与电机电调一体化选型指南。",
        source: "jev_calibrated"
      };
    }

    // Tier 3 模糊初级意向
    return {
      tier: "TIER_3_EXPLORATORY",
      maturity_score: 2.2,
      has_pet_confusion: false,
      confidence: 0.88,
      recommended_action: "初级意向线索，发送重载无人机动力白皮书与选型计算表，培育后续需求。",
      source: "jev_calibrated"
    };
  }
}

// 挂载全局单例与模块导出
if (typeof window !== 'undefined') {
  window.jevEngine = new JevEngine();
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JevEngine;
}
