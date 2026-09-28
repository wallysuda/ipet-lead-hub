/**
 * IPET Lead Hub - Smart Schema Normalizer (动态表单语义归一化解析引擎)
 * 核心创新：根据不同渠道、不同字段设计的任意询盘表单，自适应语义推断并智能归一化入库。
 */

(function (global) {
  // 别名字典 (支持中英文主流表单字段的模糊推断 + 多渠道异构字段)
  const SEMANTIC_DICTIONARY = {
    name: [
      "name", "full name", "fullname", "first name", "firstname", "last name", "lastname", "contact name", "contact",
      "customer name", "user name", "representative", "visitor", "your name", "your-name", "your_name",
      "applicant", "sender", "from name", "from", "lead name", "client name",
      "what is your name", "what's your name", "enter your name",
      "姓名", "客户姓名", "客户", "联系人", "您的称呼", "全名", "称谓", "访客", "留言人", "业务代表姓名",
      "联系人姓名", "客户名称", "怎么称呼", "称呼", "성함", "이름", "성명"
    ],
    email: [
      "email", "e-mail", "e_mail", "mail", "work email", "business email", "corporate email", "contact email",
      "company email", "email address", "your email", "your-email", "your_email", "work_email",
      "邮箱", "电子邮箱", "企业邮箱", "工作邮箱", "电子信箱", "联系邮箱", "电子邮件"
    ],
    company: [
      "company", "company name", "company_name", "companyname", "organization", "organisation", "agency", "institution", "firm", "business",
      "enterprise", "workplace", "employer", "org", "org name", "org-name", "business name", "your company",
      "what is your company", "company / organization",
      "公司", "企业名称", "单位名称", "所属机构", "机构", "单位", "公司名", "企业", "工作单位", "贵司", "公司全称",
      "회사", "회사명", "기업"
    ],
    job_title: [
      "job title", "jobtitle", "job_title", "title", "position", "role", "designation", "profession", "occupation",
      "job", "job role", "work title",
      "职位", "职务", "头衔", "岗位", "职称", "客户职位", "担任职位", "从事职位"
    ],
    phone: [
      "phone", "phone number", "phone_number", "phonenumber", "mobile", "mobile number", "tel", "telephone",
      "whatsapp", "wechat", "cell", "contact number", "contact phone", "your phone", "whatsapp number",
      "电话", "联系电话", "手机", "手机号码", "电话号码", "手机电话", "联系方式", "微信", "전화", "연락처"
    ],
    country: [
      "country", "region", "nation", "location", "area", "city", "state", "address", "country region",
      "国家", "地区", "所在地", "国别", "城市", "省份", "地址", "区域"
    ],
    requirements: [
      "requirements", "requirement", "inquiry", "enquiry", "message", "comments", "comment", "project description",
      "notes", "note", "request", "needs", "details", "project background", "description", "details",
      "project requirements", "your message", "your message here", "tell us more", "additional info", "remarks",
      "tell us about your propulsion requirements", "propulsion requirements", "primary application",
      "what is the primary application of your uav", "what is your project about",
      "需求描述", "诉求", "留言", "咨询内容", "合作诉求", "留言内容", "备注", "需求", "项目背景", "采购诉求",
      "业务类型", "工艺能力介绍", "详细需求", "具体需求", "补充说明", "问题描述", "咨询详情", "内容", "正文",
      "요구사항", "문의", "상세내용"
    ],
    mtow: [
      "mtow", "takeoff weight", "max takeoff weight", "maximum takeoff weight", "gross weight", "max weight",
      "all up weight", "auw", "takeoff mass", "what is the mtow of your uav",
      "最大起飞重量", "起飞重量", "整机起飞重量", "整机重量", "重量需求", "起飞全重", "最大重量",
      "최대이륙중량", "이륙중량"
    ],
    voltage: [
      "voltage", "bus voltage", "battery voltage", "operating voltage", "power voltage", "dc voltage", "system voltage",
      "工作电压", "母线电压", "电池电压", "电压", "电源架构", "供电电压", "额定电压"
    ],
    payload: [
      "payload", "payload capacity", "max payload", "sensor load", "payload weight", "load capacity",
      "载荷", "载荷能力", "载重量", "任务载荷", "载重需求", "载重", "有效载荷", "挂载"
    ],
    thrust: [
      "thrust", "hover thrust", "peak thrust", "rated thrust", "per axis thrust", "max thrust", "pull force",
      "推力", "悬停推力", "峰值推力", "额定推力", "单轴推力", "拉力"
    ],
    propeller: [
      "propeller", "prop", "props", "blade", "prop size", "propeller diameter", "prop size inch",
      "螺旋桨", "桨叶", "桨尺寸", "螺旋桨尺寸", "桨叶规格", "桨规格"
    ],
    uav_type: [
      "airframe", "uav type", "drone type", "uav type", "configuration", "airframe configuration", "layout",
      "drone type", "aircraft type", "platform", "multirotor", "vtol type",
      "飞行器形态", "机型形态", "构型", "飞行平台", "飞行器类型", "机型", "无人机类型", "平台类型"
    ],
    stage: [
      "project stage", "development stage", "timeline stage", "status", "project status", "phase", "timeline",
      "development phase", "program stage",
      "研发阶段", "项目阶段", "当前阶段", "开发阶段", "试飞排期", "项目进度", "阶段"
    ],
    quantity: [
      "quantity", "volume", "forecast", "units", "batch size", "annual volume", "qty", "order qty", "est qty",
      "数量", "采购量", "预估采购量", "年采购量", "首批打样套数", "需求套数", "台数", "套数"
    ]
  };

  // 基础人名有效性校验
  function isInvalidCustomerName(val) {
    if (!val || typeof val !== 'string') return true;
    const s = val.trim().toLowerCase();
    if (s.length <= 1) return true;
    const blacklist = [
      '留言', '客户', '用户', '访客', '客户留言', '网站留言', '用户留言', '留言内容', '在线留言',
      '咨询', '询盘', '测试', 'test', 'admin', 'administrator', 'guest', 'user', 'message',
      'inquiry', 'contact', 'visitor', 'unknown', 'none', 'null', 'undefined', 'anonymous',
      'linkedin 潜在客户', '潜在客户', '匿名'
    ];
    if (blacklist.includes(s) || s.includes("留言")) return true;
    return false;
  }

  // 邮箱前缀提取姓名
  function extractHumanNameFromEmail(email) {
    if (!email || !email.includes('@')) return "";
    const prefix = email.split('@')[0];
    const parts = prefix.split(/[._-]/).filter(p => p && !/^\d+$/.test(p));
    if (parts.length === 0) return "";
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
  }

  // 清洗字段键名以供模糊匹配
  function cleanKey(k) {
    return String(k || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "").trim();
  }

  // 核心类定义
  const SmartSchemaNormalizer = {
    // 1. 语义识别键名匹配 (优先精确匹配，再进行特异性关键词定向与长词优先匹配)
    detectEntityField: function (rawKey) {
      const cleaned = cleanKey(rawKey);
      if (!cleaned) return null;
      // 原始全文 / 载荷正文不是实体字段
      if (/^(原始自由文本|原始文本|全文|原文|rawtext|raw|content|fulltext|payload)$/i.test(String(rawKey||'').trim())) {
        return null;
      }
      if (/原始自由文本|原始文本/.test(String(rawKey||''))) return null;

      // 第一遍：精确全字匹配 (最高优先级)
      for (const [entityKey, aliases] of Object.entries(SEMANTIC_DICTIONARY)) {
        for (const alias of aliases) {
          const cleanedAlias = cleanKey(alias);
          if (cleaned === cleanedAlias) {
            return entityKey;
          }
        }
      }

      // 第二遍：高优先级特异性关键词定向检测 (避免 "contact-email" 被 "contact" 抢夺)
      // 注意：用原始键做词边界判断，防止 "Tell us..." 被 "tel" 误判为电话
      const rawLower = String(rawKey || '').toLowerCase();
      const wordHit = (w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`, 'i').test(rawLower);

      if (cleaned.includes("email") || cleaned.includes("mail") || cleaned.includes("邮箱") || cleaned.includes("信箱")) {
        return "email";
      }
      if (
        wordHit('phone') || wordHit('mobile') || wordHit('whatsapp') || wordHit('cell') ||
        wordHit('telephone') || wordHit('tel') || wordHit('contactnumber') ||
        cleaned.includes("whatsapp") || cleaned.includes("phonenumber") ||
        cleaned.includes("mobilephone") || cleaned.includes("mobilenumber") ||
        cleaned.includes("电话") || cleaned.includes("手机")
      ) {
        return "phone";
      }
      if (cleaned.includes("company") || cleaned.includes("org") || cleaned.includes("agency") || cleaned.includes("enterprise") || cleaned.includes("公司") || cleaned.includes("企业") || cleaned.includes("单位")) {
        return "company";
      }
      if (cleaned.includes("mtow") || cleaned.includes("takeoffweight") || cleaned.includes("takeoffmass") || cleaned.includes("grossweight") || cleaned.includes("起飞重量") || cleaned.includes("最大起飞") || cleaned.includes("최대이륙") || wordHit('weight')) {
        return "mtow";
      }
      if (cleaned.includes("voltage") || cleaned.includes("busvoltage") || cleaned.includes("母线电压") || cleaned.includes("工作电压") || cleaned.includes("电池电压")) {
        return "voltage";
      }
      if (cleaned.includes("payload") || cleaned.includes("载荷") || cleaned.includes("载重")) {
        return "payload";
      }
      if (cleaned.includes("thrust") || cleaned.includes("推力")) {
        return "thrust";
      }
      if (cleaned.includes("propeller") || cleaned.includes("blade") || cleaned.includes("螺旋桨") || cleaned.includes("桨叶")) {
        return "propeller";
      }
      if (cleaned.includes("airframe") || cleaned.includes("uavtype") || cleaned.includes("dronetype") || cleaned.includes("coaxial") || cleaned.includes("机型") || cleaned.includes("构型") || cleaned.includes("飞行器") || cleaned.includes("기체")) {
        return "uav_type";
      }
      if (cleaned.includes("job") || cleaned.includes("title") || cleaned.includes("position") || cleaned.includes("职位") || cleaned.includes("职务") || cleaned.includes("头衔")) {
        return "job_title";
      }
      if (cleaned.includes("country") || cleaned.includes("region") || cleaned.includes("nation") || cleaned.includes("国家") || cleaned.includes("地区")) {
        return "country";
      }
      if (cleaned.includes("stage") || cleaned.includes("timeline") || cleaned.includes("阶段") || cleaned.includes("进度") || cleaned.includes("prototype") && cleaned.includes("stage")) {
        return "stage";
      }
      // 应用场景 / 动力需求 / 项目说明 → requirements
      if (
        cleaned.includes("application") || cleaned.includes("usecase") || cleaned.includes("industry") ||
        cleaned.includes("propulsion") || cleaned.includes("require") || cleaned.includes("need") ||
        cleaned.includes("inquiry") || cleaned.includes("message") || cleaned.includes("comment") ||
        cleaned.includes("detail") || cleaned.includes("note") || cleaned.includes("about") ||
        cleaned.includes("需求") || cleaned.includes("留言") || cleaned.includes("诉求") || cleaned.includes("备注") ||
        cleaned.includes("用途") || cleaned.includes("应用场景")
      ) {
        return "requirements";
      }
      if (cleaned.includes("name") || cleaned.includes("姓名") || cleaned.includes("联系人") || cleaned.includes("称呼") || cleaned === "contact") {
        return "name";
      }

      // 第三遍：语义词典子串匹配（要求别名足够长，避免短词误伤）
      for (const [entityKey, aliases] of Object.entries(SEMANTIC_DICTIONARY)) {
        for (const alias of aliases) {
          const cleanedAlias = cleanKey(alias);
          if (!cleanedAlias || cleanedAlias.length < 3) continue;
          if (cleaned.includes(cleanedAlias)) return entityKey;
          // 仅当原键很短时才允许反向包含，防止「原始自由文本」被 name 命中
          if (cleaned.length >= 3 && cleaned.length <= 12 && cleanedAlias.includes(cleaned)) {
            return entityKey;
          }
        }
      }
      return null;
    },

    // 2. 深度从非结构化文本中智能提取飞行工程参数
    extractTechnicalParameters: function (fullText) {
      const text = String(fullText || "");
      const params = {};

      // 多语种：韩文/中文应用场景与机型
      if (/농업용|농업|agricultur|sprayer|spray drone|植保|农业/i.test(text)) {
        params.uav_type = params.uav_type || '农业无人机 (Agricultural UAV)';
      }
      if (/물류|cargo|delivery|화물|물류용/i.test(text)) {
        params.uav_type = params.uav_type || '物流货运无人机 (Cargo UAV)';
      }
      if (/최대이륙중량|이륙중량/.test(text) && !params.mtow) {
        const km = text.match(/(\d+(?:\.\d+)?\s*kg)/i);
        if (km) params.mtow = km[1].replace(/\s+/g, '');
      }

      // MTOW 提取 (如 65kg, 30 kg MTOW, 45-60kg)
      const mtowMatch = text.match(/(\d+(?:\.\d+)?\s*(?:-|~|to)?\s*\d*(?:\.\d+)?\s*kg)(?:\s*(?:mtow|takeoff|起飞重量))?/i);
      if (mtowMatch) params.mtow = mtowMatch[1].replace(/[\u4e00-\u9fa5]+/g, "").replace(/\s+/g, "").trim();

      // 电压提取 (如 12S, 14S, 18S, 48V, 60-78V)
      const voltMatch = text.match(/(\d+\s*s)(?:\s*(?:lipo|li-ion|battery))?|(\d+(?:-\d+)?\s*v)/i);
      if (voltMatch) params.voltage = (voltMatch[1] || voltMatch[2]).toUpperCase().replace(/[\u4e00-\u9fa5]+/g, "").replace(/\s+/g, "").trim();

      // 任务载荷提取 (如 15kg payload, 20 kg load)
      const payloadMatch = text.match(/(\d+(?:\.\d+)?\s*kg\s*(?:payload|load|载荷|载重))/i);
      if (payloadMatch) params.payload = payloadMatch[1].replace(/[\u4e00-\u9fa5]+/g, "").trim();

      // 单轴推力提取 (如 22kg thrust, 40kg 峰值推力)
      const thrustMatch = text.match(/(\d+(?:\.\d+)?\s*kg\s*(?:thrust|推力|hover thrust))/i);
      if (thrustMatch) params.thrust = thrustMatch[1].replace(/[\u4e00-\u9fa5]+/g, "").trim();

      // 桨叶规格提取 (如 28-30in, 34"-36", 45-50in carbon)
      const propMatch = text.match(/(\d+(?:-\d+)?\s*(?:in|inch|寸|")(?:\s*carbon|\s*propeller|\s*blade)?)/i);
      if (propMatch) params.propeller = propMatch[1].replace(/[\u4e00-\u9fa5]+/g, "").trim();

      // 数量提取 (如 200 - 500 sets, 50 units, 20套)
      const qtyMatch = text.match(/(\d+\s*(?:-|~|to)?\s*\d*\s*(?:sets|units|pcs|台|套))/i);
      if (qtyMatch) params.quantity = qtyMatch[1].replace(/[\u4e00-\u9fa5]+/g, "").trim();

      // 机型形态检测
      if (/coaxial|x8|共轴/i.test(text)) {
        params.uav_type = "共轴八旋翼 (Coaxial X8)";
      } else if (/multirotor|多旋翼/i.test(text)) {
        params.uav_type = "多旋翼飞行平台 (Multirotor)";
      } else if (/vtol|垂直起降/i.test(text)) {
        params.uav_type = "复合翼垂直起降 (VTOL)";
      } else if (/quad|四旋翼/i.test(text)) {
        params.uav_type = "四旋翼 (Quadcopter)";
      } else if (/hexa|六旋翼/i.test(text)) {
        params.uav_type = "六旋翼 (Hexacopter)";
      }

      // 研发阶段检测
      if (/flight test|试飞/i.test(text)) {
        params.stage = "Flight Testing (试飞验证阶段)";
      } else if (/concept|概念/i.test(text)) {
        params.stage = "Concept Evaluation (概念可行性评估阶段)";
      } else if (/prototype|样机|打样/i.test(text)) {
        params.stage = "Prototype Bench Testing (样机研制阶段)";
      } else if (/procurement|rfq|采购|批量|wholesale/i.test(text)) {
        params.stage = "Commercial Sourcing / RFQ (商业采购选型与询价)";
      }

      return params;
    },

    // 3. 智能推断来源渠道
    inferChannel: function (dataObj, fullText, channelHint) {
      let hintStr = "";
      if (typeof channelHint === "string") {
        hintStr = channelHint.trim();
      } else if (channelHint && typeof channelHint === "object") {
        hintStr = (channelHint.channel || channelHint.channel_source || "").trim();
      }
      if (hintStr) return hintStr;

      const text = (fullText || "").toLowerCase();
      const keysStr = Object.keys(dataObj).join(" ").toLowerCase();

      if (keysStr.includes("booth") || text.includes("dronex") || text.includes("exhibition") || text.includes("展位") || text.includes("展台") || text.includes("名片")) {
        return "线下专业展会 (Trade Show)";
      }
      if (text.includes("wire bonding") || text.includes("microelectronics packaging") || text.includes("封装外协") || text.includes("引线键合") || text.includes("外协打样") || text.includes("smt assembly")) {
        return "外协供应商合作自荐 (Supplier Pitch)";
      }
      if (keysStr.includes("first name") && keysStr.includes("last name") && (keysStr.includes("work email") || keysStr.includes("job title"))) {
        return "LinkedIn 广告原生表单";
      }
      if (text.includes("google") || text.includes("pmax") || text.includes("cpc")) {
        return "Google 搜索广告留资";
      }
      if (text.includes("whatsapp") || text.includes("skype") || text.includes("wechat") || text.includes("chat")) {
        return "销售初聊 / WhatsApp 沟通记录";
      }
      return "官网独立站询盘 (Website RFQ)";
    },

    // 4. 主函数：任意表单对象动态归一化入库
    normalize: function (rawInput, channelHint = "") {
      if (!rawInput) return null;

      // 如果传入的是纯文本字符串，先转为自由文本解析
      if (typeof rawInput === "string") {
        return this.parseFreeText(rawInput, channelHint);
      }

      const raw = { ...rawInput };
      const normalized = {
        name: "",
        email: "",
        company: "",
        job_title: "",
        phone: "",
        country: "",
        requirements: "",
        mtow: "",
        voltage: "",
        payload: "",
        thrust: "",
        propeller: "",
        uav_type: "",
        stage: "",
        quantity: ""
      };

      const unmappedFields = {};
      const fullTextParts = [];

      // 第一遍遍历：基于语义别名字典自动映射核心字段
      for (const [key, value] of Object.entries(raw)) {
        if (value === null || value === undefined) continue;
        const valStr = String(value).trim();
        if (!valStr) continue;

        fullTextParts.push(`${key}: ${valStr}`);
        const entityField = this.detectEntityField(key);

        if (entityField && !normalized[entityField]) {
          normalized[entityField] = valStr;
        } else {
          // 保留未映射字段，100% 无损留存
          unmappedFields[key] = valStr;
        }
      }

      const fullText = fullTextParts.join(" ");

      // 第二遍增强：从全文中补全缺失的关键飞行技术参数
      const extractedParams = this.extractTechnicalParameters(fullText);
      for (const [pKey, pVal] of Object.entries(extractedParams)) {
        if (!normalized[pKey]) {
          normalized[pKey] = pVal;
        }
      }

      // 第三遍清洗姓名
      let finalName = normalized.name || "";
      finalName = finalName.replace(/^(?:(?:IPET)?\s*(?:客户留言|客户姓名|客户|Contact|Name|Full Name|姓名)[:：\s]*)+/gi, "").trim();
      if (!finalName || isInvalidCustomerName(finalName)) {
        finalName = extractHumanNameFromEmail(normalized.email) || "Partner";
      }

      // 清洗企业名
      let finalCompany = normalized.company || "";
      finalCompany = finalCompany.replace(/^(?:IPET)?\s*(?:公司|企业|Organization)[:：\s]*/gi, "").trim();
      if (!finalCompany && normalized.email && normalized.email.includes("@")) {
        const domain = normalized.email.split("@")[1].split(".")[0];
        if (!["gmail", "yahoo", "hotmail", "outlook", "163", "qq"].includes(domain)) {
          finalCompany = domain.charAt(0).toUpperCase() + domain.slice(1);
        }
      }

      // 确定渠道来源
      const finalChannel = this.inferChannel(raw, fullText, channelHint);

      // 构建用于展示与存储的完整字段集 fields_filled
      const fieldsFilled = { ...raw };

      // 生成标准化线索对象
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const timeStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

      const leadId = raw.id || `LEAD-HUB-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

      // 提取场景标签
      let scenario = "工业无人机整机动力选型";
      if (finalChannel.includes("供应商") || fullText.includes("packaging") || fullText.includes("wire bonding")) {
        scenario = "微电子封装与外协合作对接 (Supplier Pitch)";
      } else if (finalChannel.includes("展会") || fullText.includes("dronex")) {
        scenario = "DroneX 现场会面与打样对接";
      } else if (normalized.mtow) {
        scenario = `${normalized.mtow} 重载无人机动力总成选型`;
      } else if (normalized.uav_type) {
        scenario = `${normalized.uav_type} 动力系统选型匹配`;
      }

      const finalLead = {
        id: leadId,
        submitted_at: raw.submitted_at || timeStr,
        channel_source: finalChannel,
        channel_scenario: scenario,
        name: finalName,
        email: (normalized.email || "").toLowerCase().trim(),
        company: finalCompany || "Individual / Stealth Program",
        job_title: normalized.job_title || "",
        phone: normalized.phone || "",
        country: normalized.country || "",
        raw_text: fullText,
        raw_requirements: normalized.requirements || fullText,
        fields_filled: fieldsFilled,
        detected_params: {
          mtow: normalized.mtow || extractedParams.mtow || "",
          voltage: normalized.voltage || extractedParams.voltage || "",
          payload: normalized.payload || extractedParams.payload || "",
          thrust: normalized.thrust || extractedParams.thrust || "",
          propeller: normalized.propeller || extractedParams.propeller || "",
          uav_type: normalized.uav_type || extractedParams.uav_type || "",
          stage: normalized.stage || extractedParams.stage || "",
          quantity: normalized.quantity || extractedParams.quantity || ""
        },
        technical_parameters: {
          mtow: normalized.mtow || extractedParams.mtow || "",
          voltage: normalized.voltage || extractedParams.voltage || "",
          payload: normalized.payload || extractedParams.payload || "",
          thrust: normalized.thrust || extractedParams.thrust || "",
          propeller: normalized.propeller || extractedParams.propeller || "",
          uav_type: normalized.uav_type || extractedParams.uav_type || "",
          stage: normalized.stage || extractedParams.stage || "",
          quantity: normalized.quantity || extractedParams.quantity || ""
        },
        status: "NEW", // NEW, CONTACTED, IN_DISCUSSION, QUALIFIED, ARCHIVED
        sync_version: 1
      };

      finalLead.analysis_brief = this.synthesizeAnalysis(finalLead);
      return finalLead;
    },

    // 5. 自由非结构化文本/聊天记录智能 NLP 解析器（兼容多渠道异构粘贴）
    parseFreeText: function (freeText, channelHint = "销售初聊 / WhatsApp 沟通记录") {
      const text = String(freeText || "").trim();
      if (!text) return null;

      const raw = {
        "原始自由文本": text
      };

      // 5.0 渠道自动识别
      const ch = this.detectChannel(text, channelHint);
      if (ch) raw["渠道"] = ch;

      // 5.1 先扫 key:value / key：value / key = value 行（表单导出、后台留言、邮件头）
      const kvRe = /^[\s>*-]*([^\n:：=]{1,80})[:：=]\s*(.+)$/gm;
      let kvHit = 0;
      let m;
      const reqParts = [];
      while ((m = kvRe.exec(text)) !== null) {
        const key = m[1].trim();
        const val = m[2].trim();
        if (!val || val.length > 2000) continue;
        const entity = this.detectEntityField(key);
        if (entity && entity !== 'requirements' && !raw[this._entityToRawKey(entity)]) {
          raw[this._entityToRawKey(entity)] = val;
          kvHit++;
        } else if (entity === 'requirements') {
          reqParts.push(val);
        } else if (/message|inquiry|comment|detail|requirement|留言|需求|内容|说明/i.test(key) && val.length > 8) {
          reqParts.push(val);
        }
      }
      if (reqParts.length && !raw["需求描述"]) {
        raw["需求描述"] = reqParts.join('\n');
      }

      // 5.2 表格式粘贴：首行表头 + 后续一行数据（Tab / 多空格）
      if (kvHit === 0) {
        const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        if (lines.length >= 2) {
          const sep = lines[0].includes('\t') ? '\t' : null;
          const heads = sep ? lines[0].split(sep).map(s => s.trim()) : null;
          const vals = sep ? lines[1].split(sep).map(s => s.trim()) : null;
          if (heads && vals && heads.length >= 2 && heads.length === vals.length) {
            heads.forEach((h, i) => {
              const entity = this.detectEntityField(h);
              if (entity && vals[i]) raw[this._entityToRawKey(entity)] = vals[i];
            });
          }
        }
      }

      // 5.3 邮箱 / 电话 / 公司 / 姓名 兜底抽取
      if (!raw["电子邮箱"]) {
        const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) raw["电子邮箱"] = emailMatch[1];
      }

      if (!raw["联系电话"]) {
        const phoneMatch = text.match(/(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,5}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
        if (phoneMatch && phoneMatch[0].length >= 7) raw["联系电话"] = phoneMatch[0].trim();
      }

      if (!raw["公司名称"]) {
        let comp = "";
        const explicitComp = text.match(/(?:company|organization|organisation|org name|firm|business|company name|公司|企业|单位|工作单位|贵司)[:：]\s*([^\r\n,;]{2,60})/i);
        if (explicitComp) {
          comp = explicitComp[1].trim().split(/\s{2,}|\t/)[0];
        } else {
          const fromComp = text.match(/\bfrom\s+([A-Z][A-Za-z0-9\s&.,-]{2,30}?)(?=[.,;]|\s+we\s|\s+i\s|\s+need|\s+looking|\n|$)/i);
          if (fromComp && !fromComp[1].toLowerCase().includes("china") && !fromComp[1].toLowerCase().includes("ipet")) {
            comp = fromComp[1].trim();
          }
        }
        if (comp) raw["公司名称"] = comp.replace(/\.$/, '').trim();
      }

      if (!raw["客户姓名"]) {
        let name = "";
        const fromHeader = text.match(/^From:\s*([A-Za-z\s.'-]+?)(?:\s*<[^>]+>|$)/im);
        if (fromHeader && fromHeader[1].trim()) {
          name = fromHeader[1].trim();
        } else {
          const explicitName = text.match(/(?:full\s*name|contact\s*name|first\s*name|name|姓名|联系人|联系姓名|怎么称呼)[:：]\s*([A-Za-z\s.'-]{2,40}|[一-龥가-힯]{2,20})/i);
          if (explicitName) {
            name = explicitName[1].trim();
          } else {
            const introName = text.match(/(?:this is|my name is|i am|i'm)\s+([A-Z][A-Za-z\s]{1,20})/i);
            if (introName) name = introName[1].trim();
          }
        }
        // 去掉误带的邮箱/尖括号
        name = name.replace(/<[^>]+>/g, '').replace(/[\w.+-]+@[\w.-]+\.\w+/g, '').trim();
        if (name) raw["客户姓名"] = name;
      }

      // 5.4 若仍无需求正文，用去掉已识别键值后的剩余文本
      if (!raw["需求描述"]) {
        const leftover = text
          .replace(/^[^\n:：=]{1,80}[:：=].*$/gm, '')
          .replace(/[\w.+-]+@[\w.-]+\.\w+/g, '')
          .trim();
        if (leftover.length > 15) raw["需求描述"] = leftover.slice(0, 4000);
      }

      // 姓名统一清洗：去邮箱、尖括号、多余空白；拒绝整段正文误入
      if (raw["客户姓名"]) {
        let n = String(raw["客户姓名"])
          .replace(/<[^>]+>/g, '')
          .replace(/[\w.+-]+@[\w.-]+\.\w+/g, '')
          .split(/\r?\n/)[0]
          .replace(/\s{2,}/g, ' ')
          .trim();
        if (n.length > 40 || n.includes(':') || n.includes('：')) n = '';
        raw["客户姓名"] = n;
      }

      return this.normalize(raw, channelHint || ch || "多渠道粘贴录入");
    },

    _entityToRawKey: function (entity) {
      const map = {
        name: '客户姓名',
        email: '电子邮箱',
        company: '公司名称',
        job_title: '职位',
        phone: '联系电话',
        country: '国家',
        requirements: '需求描述',
        mtow: 'mtow',
        voltage: 'voltage',
        payload: 'payload',
        thrust: 'thrust',
        propeller: 'propeller',
        uav_type: 'uav_type',
        stage: 'stage',
        quantity: 'quantity'
      };
      return map[entity] || entity;
    },

    /** 渠道自动识别 */
    detectChannel: function (text, hint) {
      const t = String(text || '').toLowerCase();
      if (!hint) {
        if (/facebook|fb lead|meta lead/.test(t)) return 'Facebook Lead Form';
        if (/linkedin|lead gen|campaign/.test(t)) return 'LinkedIn Lead Gen Form';
        if (/whatsapp|telegram|skype/.test(t)) return '即时通讯询盘';
        if (/wordpress|contact form|cf7|wpforms|typeform/.test(t)) return '官网表单';
        if (/from:\s|subject:\s|sent from my/.test(t)) return '邮件询盘';
        if (/dronex|xponential|expo|booth/.test(t)) return '展会登记';
        return '多渠道粘贴录入';
      }
      return hint;
    },

    // 6. 万能 CSV 解析器（支持自动表头识别与批量导入）
    parseCSV: function (csvContent, channelHint = "") {
      const lines = String(csvContent || "").split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) return [];

      // 简单 CSV 分隔处理（支持逗号或制表符）
      const splitLine = (l) => {
        const row = [];
        let inQuotes = false;
        let token = "";
        for (let i = 0; i < l.length; i++) {
          const char = l[i];
          if (char === '"' || char === "'") {
            inQuotes = !inQuotes;
          } else if ((char === ',' || char === '\t') && !inQuotes) {
            row.push(token.trim().replace(/^["']|["']$/g, ""));
            token = "";
          } else {
            token += char;
          }
        }
        row.push(token.trim().replace(/^["']|["']$/g, ""));
        return row;
      };

      const headers = splitLine(lines[0]);
      const results = [];

      for (let i = 1; i < lines.length; i++) {
        const values = splitLine(lines[i]);
        if (values.length === 0 || values.every(v => !v)) continue;

        const rowObj = {};
        headers.forEach((h, hIdx) => {
          if (h && values[hIdx] !== undefined) {
            rowObj[h] = values[hIdx];
          }
        });

        const normalizedLead = this.normalize(rowObj, channelHint);
        if (normalizedLead && (normalizedLead.email || normalizedLead.name)) {
          results.push(normalizedLead);
        }
      }

      return results;
    },

    // 7. 询盘情况综合分析引擎（确保新入库线索首次展示即为专业结构化分析，绝不显示原始表单键值对）
    synthesizeAnalysis: function (lead) {
      if (!lead) return {};
      const rawObj = lead.fields_filled || {};
      const p = lead.technical_parameters || lead.detected_params || {};

      // 若字段本身已是由中文分析键构成的结构化分析结果（如历史线索），直接返回过滤后的分析字段
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

      // 对于所有新录入、Webhook 接入、CSV 批量导入的线索，自动进行首次深度意图与技术分析
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
      } else if (lead.raw_requirements && lead.raw_requirements.length > 5) {
        analyzed['采购诉求'] = lead.raw_requirements.slice(0, 70);
      } else {
        analyzed['采购诉求'] = 'IPET 工业无人机大载重动力系统选型与商务对接';
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
        } else {
          uavType = '工业级重载飞行器平台';
        }
      }
      analyzed['飞行器形态'] = uavType;

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

      // 6. 研发阶段 / 交付物需求
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
  };

  // 挂载至全局环境
  if (typeof module !== "undefined" && module.exports) {
    module.exports = SmartSchemaNormalizer;
  } else {
    global.SmartSchemaNormalizer = SmartSchemaNormalizer;
  }
})(typeof window !== "undefined" ? window : global);
