/**
 * IPET LEAD ASSETS HUB · 北美工业级工程跟进邮件生成引擎
 * 
 * 核心规范与准则:
 * 1. 100% 纯正英文 (Zero Chinese Characters Guarantee):
 *    无论线索表单、留言或内部标签包含多少中文字符，生成的 Email 称谓、正文、署名绝对严禁出现任何中文字符！
 * 2. 5 大客户画像智能路由 (Multi-Persona Routing):
 *    - TYPE_A_ACADEMIC: 高校与科研院所航天团队
 *    - TYPE_B_COMMERCIAL_OEM: 商业无人机 OEM / 工业整机研发与采购
 *    - TYPE_C_LOW_INFO: 极简移动端表单 / 初级意向
 *    - TYPE_S_SUPPLIER: 外部微电子封装 / 引线键合 / 精密打样加工自荐 (严禁索取飞行参数，针对性转交供应链并索取 Line Card)
 *    - TYPE_D_DISQUALIFIED: 误触红线 / 宠物玩具误点 (严禁询问无人机指标，直接礼貌澄清工业动力业务边界并归档)
 * 3. 针对询盘特异性策略切角 (Dynamic Specific Strategies):
 *    每次根据询盘特性提供 3 种深度定制的回复策略（如重载能效、共轴冗余、样机交付、展会会面、供应链评估等）
 * 4. 严格 35~50 字符的高打开率纯英文主题行
 */

// 判断人名是否为无效占位符（如 "留言"、"客户"、"访客"、"测试" 等）
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

// 从企业邮箱前缀提取规范的英文名 (如 preeti.nair@baacoaluminum.cc -> Preeti Nair)
function extractHumanNameFromEmail(email) {
  if (!email || !email.includes('@')) return "";
  const prefix = email.split('@')[0];
  const parts = prefix.split(/[._-]/).filter(p => p && !/^\d+$/.test(p));
  if (parts.length === 0) return "";
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

const InquiryResponder = {
  // 客户画像分类 (5 类画像：科研、商业OEM、极简移动端、外协供应商、误触红线)
  classifyPersona: function (lead) {
    const email = (lead.email || "").toLowerCase();
    const rawRequirements = (lead.raw_requirements || lead.requirements || "").toLowerCase();
    const fieldsStr = JSON.stringify(lead.fields_filled || {}).toLowerCase();
    const jobTitle = (lead.job_title || "").toLowerCase();
    const company = (lead.company || "").toLowerCase();
    const rawText = (lead.raw_text || "").toLowerCase();
    const formName = (lead.form_name || lead.channel || "").toLowerCase();
    const fullText = (rawText + " " + rawRequirements + " " + fieldsStr + " " + jobTitle + " " + company + " " + formName).toLowerCase();

    // 1. 优先排除与识别无效误触/宠物玩具/红线 (防宠物/防玩具壁垒)
    const nonBrandText = fullText.replace(/ipet/gi, "");
    const hasPetConfusion = lead.jev_analysis?.has_pet_confusion === true ||
      /\b(pet|pets|dog|dogs|cat|cats|puppy|kitten|toy|toys|collar|pet food|fpv racer|chew)\b/i.test(nonBrandText);
    const isDisqualifiedTier = lead.jev_analysis?.tier === "DISQUALIFIED";

    if (hasPetConfusion || isDisqualifiedTier) {
      return "TYPE_D_DISQUALIFIED";
    }

    // 2. 外部供应商 / 外协加工 / 微电子封装 / 引线键合 / 精密打样加工自荐 (非无人机买家)
    const isSupplierPitch = fullText.includes("packaging supplier") ||
      fullText.includes("wire bonding") ||
      fullText.includes("microelectronics packaging") ||
      fullText.includes("microelectronics assembly") ||
      fullText.includes("微电子封装") ||
      fullText.includes("芯片封装") ||
      fullText.includes("引线键合") ||
      fullText.includes("外协微电子") ||
      fullText.includes("元器件组装") ||
      fullText.includes("外协对接") ||
      fullText.includes("外协合作") ||
      fullText.includes("外协打样") ||
      fullText.includes("cnc machining supplier") ||
      fullText.includes("smt assembly") ||
      fullText.includes("foundry");

    if (isSupplierPitch) {
      return "TYPE_S_SUPPLIER";
    }

    // 3. 高校航天与学术科研
    if (email.includes(".edu") || email.includes(".ac.") || fullText.includes("lab") || fullText.includes("university") || fullText.includes("research") || fullText.includes("wind tunnel") || fullText.includes("aerospace department")) {
      return "TYPE_A_ACADEMIC";
    }

    // 4. 商业无人机 OEM / 整机研发 / 工业采购
    if (fullText.includes("oem") || fullText.includes("heavy lift") || fullText.includes("logistics") || fullText.includes("inspection") || fullText.includes("vtol") || fullText.includes("agri") || fullText.includes("sprayer") || fullText.includes("cargo") || fullText.includes("propulsion") ||
        fullText.includes("gremsy") || fullText.includes("gimbal") || fullText.includes("motor") || fullText.includes("esc") || fullText.includes("propeller") || fullText.includes("prop") || fullText.includes("concept evaluation") || fullText.includes("payload") ||
        fullText.includes("procuring") || fullText.includes("procurement") || fullText.includes("flight test") || fullText.includes("multirotor") || fullText.includes("drone") || fullText.includes("uav") || fullText.includes("sourcing") || fullText.includes("wholesale") || fullText.includes("dronex") || fullText.includes("trade show")) {
      return "TYPE_B_COMMERCIAL_OEM";
    }

    return "TYPE_C_LOW_INFO";
  },

  // 1. 深度解析提取客户与询盘实体 (Deep Inquiry Entity Extraction)
  analyzeLead: function (lead) {
    const email = (lead.email || "").toLowerCase();
    const rawRequirements = lead.raw_requirements || lead.requirements || "";
    const rawText = ((lead.raw_text || "") + " " + rawRequirements + " " + JSON.stringify(lead.fields_filled || {}) + " " + (lead.form_name || lead.channel || "") + " " + (lead.job_title || "")).toLowerCase();
    const persona = InquiryResponder.classifyPersona(lead);

    // 清洗客户姓名 (彻底去除任何前缀及非英文字符)
    let rawName = lead.name || "";
    rawName = rawName.replace(/^(?:(?:IPET)?\s*(?:客户留言|客户姓名|客户|Contact|Name|Full Name|姓名)[:：\s]*)+/gi, "").trim();
    if (!rawName || isInvalidCustomerName(rawName)) {
      rawName = extractHumanNameFromEmail(lead.email) || "Partner";
    }

    // 提取纯英文称谓 (callName)
    const nameParts = rawName.split(/\s+/).filter(Boolean);
    let callName = nameParts[0] || "there";
    const vietnameseFamilyNames = ['nguyen', 'tran', 'le', 'pham', 'hoang', 'huynh', 'phan', 'vu', 'vo', 'dang', 'bui', 'do', 'ho', 'ngo', 'duong', 'ly'];
    if (nameParts.length >= 3 || (nameParts.length >= 2 && vietnameseFamilyNames.includes(nameParts[0].toLowerCase()))) {
      callName = nameParts[nameParts.length - 1];
    } else {
      callName = nameParts[0] || "there";
    }
    if (isInvalidCustomerName(callName)) {
      callName = (extractHumanNameFromEmail(lead.email).split(' ')[0]) || "there";
    }
    // 保证 callName 100% 纯英文，不带任何中文
    callName = callName.replace(/[\u4e00-\u9fa5]+/g, "").trim();
    if (!callName || callName.length < 2) {
      callName = "there";
    }

    // 企业名称与英文清洗
    let company = lead.company || "";
    company = company.replace(/^(?:IPET)?\s*(?:公司|企业|Organization)[:：\s]*/gi, "").trim();
    let cleanEnglishCompany = company.replace(/[\u4e00-\u9fa5]+/g, "").trim();
    if (!cleanEnglishCompany || cleanEnglishCompany.length < 2) {
      cleanEnglishCompany = "your company";
    }
    let compShort = cleanEnglishCompany.replace(/\s+(Incorporated|Inc\.?|Corporation|Corp\.?|LLC|Ltd\.?|Co\.?)\b/gi, '').trim() || cleanEnglishCompany;

    // 行业画像与产品
    let industryProfile = "工业无人机整机/系统集成商";
    let isGimbalPayload = false;
    let isTradeShowMeeting = rawText.includes("dronex") || rawText.includes("trade show") || rawText.includes("booth") || rawText.includes("exhibition") || rawText.includes("展会") || rawText.includes("展台");
    let isPrototypeSupplier = rawText.includes("prototype supplier") || rawText.includes("precision prototype") || rawText.includes("kxprecision") || rawText.includes("kaixin");
    let isSupplierPitch = persona === "TYPE_S_SUPPLIER";

    if (email.includes("gremsy") || rawText.includes("gremsy") || company.toLowerCase().includes("gremsy")) {
      company = "Gremsy Joint Stock Company";
      cleanEnglishCompany = "Gremsy";
      compShort = "Gremsy";
      industryProfile = "全球知名航测/工业无人机三轴云台与载荷制造商 (Gremsy)";
      isGimbalPayload = true;
    } else if (email.includes("matzka") || rawText.includes("matzka") || company.toLowerCase().includes("matzka")) {
      company = "Matzka Incorporated";
      cleanEnglishCompany = "Matzka Incorporated";
      compShort = "Matzka";
      industryProfile = "商业无人机整机研发与商业采购 (OEM Drone Program & Sourcing)";
    } else if (email.includes("baaco") || rawText.includes("baaco") || company.toLowerCase().includes("baaco")) {
      company = "Baaco Aluminum";
      cleanEnglishCompany = "Baaco Aluminum";
      compShort = "Baaco Aluminum";
      industryProfile = "工业五金与航空级铝合金构件制造 (Baaco Aluminum)";
    } else if (email.includes("soaringaero") || company.toLowerCase().includes("soaring aerospace")) {
      company = "Soaring Aerospace";
      cleanEnglishCompany = "Soaring Aerospace";
      compShort = "Soaring Aerospace";
      industryProfile = "重载多旋翼物流无人机整机研发 (Heavy-Lift Drone Delivery)";
    } else if (email.includes("firstlevelinc") || company.toLowerCase().includes("first level") || isSupplierPitch) {
      company = cleanEnglishCompany || "First level Inc.";
      industryProfile = "精密微电子封装与引线键合外协供应商 (Microelectronics Packaging)";
      isSupplierPitch = true;
    } else if (email.includes(".edu") || email.includes(".ac.") || rawText.includes("university") || rawText.includes("lab")) {
      industryProfile = "高校航天与飞行器控制科研团队 (Academic R&D)";
    } else if (rawText.includes("cargo") || rawText.includes("logistics") || rawText.includes("heavy lift") || rawText.includes("65kg") || rawText.includes("50kg")) {
      industryProfile = "大载重货运/重载物流无人机 OEM";
    }

    // 产品识别 (UI 中文 + 邮件用纯英文)
    let product = "IPET 工业无人机动力总成";
    let englishProduct = "IPET industrial UAV propulsion system";
    let productCode = "GENERAL";

    if (rawText.includes("i7") || rawText.includes("120kv") || rawText.includes("140kv")) {
      product = "IPET I7 一体化动力系统 (电机 + 电调 + 螺旋桨)";
      englishProduct = "IPET I7 integrated propulsion system";
      productCode = "I7";
    } else if (rawText.includes("i8") || rawText.includes("100kv") || rawText.includes("heavy lift") || rawText.includes("65kg") || rawText.includes("50kg")) {
      product = "IPET I8 重载一体化动力系统 (电机 + 电调 + 螺旋桨)";
      englishProduct = "IPET I8 heavy-lift powertrain system";
      productCode = "I8";
    } else if (isSupplierPitch) {
      product = "微电子封装/外协加工方案对接";
      englishProduct = "microelectronics packaging & assembly evaluation";
      productCode = "SUPPLIER_SVC";
    } else if (isTradeShowMeeting || isPrototypeSupplier) {
      product = "DroneX 展位现场对接 & 工业级电机结构件外协打样";
      englishProduct = "DroneX booth meeting & prototype machining";
      productCode = "TRADESHOW_SUPPLIER";
    }

    // 机型形态 (UI 中文标签 + 邮件用纯英文标签)
    let uavType = "工业级飞行平台";
    let englishAirframe = "industrial UAV airframe";
    let uavTypeCode = "STANDARD";

    if (rawText.includes("multirotor") || rawText.includes("多旋翼")) {
      uavType = "多旋翼飞行平台 (Multirotor)";
      englishAirframe = "multirotor airframe";
      uavTypeCode = "MULTIROTOR";
    } else if (rawText.includes("coaxial") || rawText.includes("x8") || rawText.includes("共轴")) {
      uavType = "共轴八旋翼 (Coaxial X8)";
      englishAirframe = "coaxial X8 platform";
      uavTypeCode = "COAXIAL_X8";
    } else if (rawText.includes("vtol") || rawText.includes("垂直起降")) {
      uavType = "复合翼垂直起降 (VTOL)";
      englishAirframe = "VTOL aircraft";
      uavTypeCode = "VTOL";
    } else if (rawText.includes("quad") || rawText.includes("四旋翼")) {
      uavType = "四旋翼 (Quadcopter)";
      englishAirframe = "quadcopter airframe";
      uavTypeCode = "QUAD";
    } else if (rawText.includes("hexa") || rawText.includes("六旋翼")) {
      uavType = "六旋翼 (Hexacopter)";
      englishAirframe = "hexacopter airframe";
      uavTypeCode = "HEXA";
    } else if (isSupplierPitch) {
      uavType = "外协微电子与元器件组装 (Microelectronics Assembly)";
      englishAirframe = "microelectronics assembly";
      uavTypeCode = "SUPPLIER";
    } else if (rawText.includes("other") || rawText.includes("其它") || rawText.includes("其他")) {
      uavType = "特种非标构型 / 载荷测试平台 (Other)";
      englishAirframe = "specialized airframe layout";
      uavTypeCode = "OTHER";
    }

    // 研发阶段与采购属性 (UI 中文标签 + 邮件用纯英文标签)
    let projectStage = "新机型评估与研发";
    let englishStage = "prototype development";
    let stageCode = "RND";
    const isProcurementRFQ = rawText.includes("procuring") || rawText.includes("procurement") || rawText.includes("specifications") || (lead.job_title || "").toLowerCase().includes("procurement") || (lead.job_title || "").toLowerCase().includes("purchasing") || rawText.includes("baaco") || rawText.includes("wholesale");

    if (isSupplierPitch) {
      projectStage = "供应链商务合作与方案评估阶段";
      englishStage = "supplier qualification review";
      stageCode = "SUPPLIER_EVAL";
    } else if (isTradeShowMeeting) {
      projectStage = "DroneX 展台会面与供应链初审";
      englishStage = "DroneX meeting & capability review";
      stageCode = "TRADESHOW";
    } else if (rawText.includes("flight testing") || rawText.includes("flight test") || rawText.includes("试飞")) {
      projectStage = "Flight Testing (试飞验证阶段)";
      englishStage = "flight testing";
      stageCode = "FLIGHT_TEST";
    } else if (rawText.includes("concept") || rawText.includes("evaluation") || rawText.includes("概念")) {
      projectStage = "Concept Evaluation (概念可行性评估阶段)";
      englishStage = "concept evaluation";
      stageCode = "CONCEPT";
    } else if (rawText.includes("prototype") || rawText.includes("样机")) {
      projectStage = "Prototype Bench Testing (样机研制阶段)";
      englishStage = "prototype bench testing";
      stageCode = "PROTOTYPE";
    } else if (rawText.includes("production") || rawText.includes("批量") || rawText.includes("rfq") || rawText.includes("quote")) {
      projectStage = "Commercial Sourcing / RFQ (商业采购选型与询价)";
      englishStage = "commercial sourcing & RFQ";
      stageCode = "SOURCING";
    }

    // 提取询盘中已明确的技术参数 (严格清洗掉中文字符)
    const detectedParams = {};
    if (lead.technical_parameters) {
      Object.assign(detectedParams, lead.technical_parameters);
    }
    const mtowMatch = rawText.match(/(\d+(?:\.\d+)?\s*(?:-|~|to)?\s*\d*(?:\.\d+)?\s*kg(?:\s*mtow|\s*takeoff)?)/i);
    if (mtowMatch && !detectedParams.mtow) detectedParams.mtow = mtowMatch[1].replace(/[\u4e00-\u9fa5]+/g, "").trim();
    const voltMatch = rawText.match(/(\d+\s*s(?:\s*lipo|\s*li-ion|\s*battery)?|\d+v)/i);
    if (voltMatch && !detectedParams.voltage) detectedParams.voltage = voltMatch[1].toUpperCase().replace(/[\u4e00-\u9fa5]+/g, "").trim();
    const payloadMatch = rawText.match(/(\d+(?:\.\d+)?\s*kg\s*(?:payload|load))/i);
    if (payloadMatch && !detectedParams.payload) detectedParams.payload = payloadMatch[1].replace(/[\u4e00-\u9fa5]+/g, "").trim();
    const qtyMatch = rawText.match(/(\d+\s*(?:-|~|to)?\s*\d*\s*(?:sets|units|pcs))/i);
    if (qtyMatch && !detectedParams.quantity) detectedParams.quantity = qtyMatch[1].replace(/[\u4e00-\u9fa5]+/g, "").trim();

    const isHeavyLift = productCode === "I8" ||
      rawText.includes("heavy lift") ||
      rawText.includes("cargo") ||
      (detectedParams.mtow && parseInt(detectedParams.mtow) >= 40);

    return {
      rawName,
      callName,
      company,
      cleanEnglishCompany,
      compShort,
      industryProfile,
      isGimbalPayload,
      isProcurementRFQ,
      isTradeShowMeeting,
      isPrototypeSupplier,
      isSupplierPitch,
      isHeavyLift,
      isDisqualified: persona === "TYPE_D_DISQUALIFIED",
      persona,
      product,
      englishProduct,
      productCode,
      uavType,
      englishAirframe,
      uavTypeCode,
      projectStage,
      englishStage,
      stageCode,
      rawText,
      detectedParams,
      fieldsFilled: lead.fields_filled || {}
    };
  },

  // 2. 获取该客户适用的 3 种策略切角
  getStrategies: function (analysis) {
    if (analysis.isDisqualified || analysis.persona === "TYPE_D_DISQUALIFIED") {
      return [
        {
          id: "disqualify_polite",
          label: "B2B 工业级无人机业务边界澄清",
          tag: "推荐主力",
          desc: "澄清 IPET 严格专注工业重载无人机动力总成研制，说明业务边界并礼貌归档"
        },
        {
          id: "disqualify_brief",
          label: "极简业务范围回绝与归档",
          tag: "高效归档",
          desc: "一两句话清晰说明 IPET 核心业务，礼貌回绝非无人机动力总成业务咨询"
        }
      ];
    }

    if (analysis.isSupplierPitch || analysis.persona === "TYPE_S_SUPPLIER") {
      return [
        {
          id: "supplier_intake",
          label: "供应商资质与加工能力登记",
          tag: "推荐主力",
          desc: "感谢自荐微电子封装/外协加工，索取企业 Line Card 与加工精度指标并转交供应链团队"
        },
        {
          id: "supplier_nda_review",
          label: "图纸对接与双向保密协议",
          tag: "深度对接",
          desc: "提供双向 MNDA 保密协议，以便在后续新产品试制或微电子封装时进行图纸对接"
        },
        {
          id: "supplier_decline",
          label: "现有供应链饱和礼貌存档",
          tag: "礼貌留存",
          desc: "感谢自荐，告知目前对应工艺供应配额充足，已录入合格供应商备选库供后续项目选用"
        }
      ];
    }

    if (analysis.isTradeShowMeeting || analysis.isPrototypeSupplier) {
      return [
        {
          id: "dronex_booth_meet",
          label: "DroneX 展台会面预约与时间锁定",
          tag: "推荐主力",
          desc: "确认 IPET 位于 DroneX 展位信息，锁定现场会谈时间段并安排工程/商务负责人对接"
        },
        {
          id: "prototype_sourcing",
          label: "精密样件打样与外协加工初审",
          tag: "供应链评估",
          desc: "索取生产加工能力、加工公差与表面处理设备清单，评估电机结构件外协"
        },
        {
          id: "pre_show_call",
          label: "展前线上技术交流与资料预审",
          tag: "高效前置",
          desc: "展会前安排 15 分钟简短线上通话，先行签署 NDA 并交换 IPET 样机加工图纸"
        }
      ];
    }

    if (analysis.isHeavyLift || analysis.productCode === "I8") {
      return [
        {
          id: "heavy_lift_sizing",
          label: "重载能效与选型计算",
          tag: "推荐主力",
          desc: "聚焦 12.1 g/W 悬停能效比、高压架构与重载动力匹配计算"
        },
        {
          id: "coaxial_redundancy",
          label: "共轴冗余与极限航时",
          tag: "可靠性首选",
          desc: "聚焦 316 分钟极限航时验证、共轴 X8 差速防扭与单轴失效保全机制"
        },
        {
          id: "commercial_sample",
          label: "样品测试与批量交付",
          tag: "商务推进",
          desc: "聚焦首批样品台架交付、批产交付周期与 DroneCAN 遥测协议联调"
        }
      ];
    }

    if (analysis.isGimbalPayload || analysis.productCode === "I7") {
      return [
        {
          id: "sizing_dyno",
          label: "技术选型与台架数据",
          tag: "推荐主力",
          desc: "重点输出 I7 真实推力/能效台架曲线与 3D STEP 模型，快速确认动力包络"
        },
        {
          id: "concept_eval",
          label: "概念验证与样品打样",
          tag: "项目推进",
          desc: "对齐 Concept Evaluation 阶段里程碑，加速样机试制与打样测试周期"
        },
        {
          id: "payload_vibration",
          label: "云台载荷低震动与抗干扰",
          tag: "深度协同",
          desc: "突出 FOC 电调超低 EMI 与出厂动平衡，保障 Gremsy 云台与光学高精度稳定"
        }
      ];
    }

    if (analysis.isProcurementRFQ) {
      return [
        {
          id: "procurement_intake",
          label: "商务采购对接与规格接收",
          tag: "推荐主力",
          desc: "确认专人对接代表与规格接收渠道，提供 NDA 协议支持并快速对齐项目需求"
        },
        {
          id: "flight_testing",
          label: "试飞阶段动力选型加速",
          tag: "项目推进",
          desc: "针对 Flight Testing 试飞排期，前置锁定动力参数并快速调拨试飞测试样机"
        },
        {
          id: "oem_supply",
          label: "批量供应与 OEM 战略合作",
          tag: "商务谈判",
          desc: "探讨批量采购规模、首批交付排期与长期互利 OEM 供货协议"
        }
      ];
    }

    return [
      {
        id: "standard_sizing",
        label: "工程技术选型与 CAD",
        tag: "推荐主力",
        desc: "提供匹配计算表、台架推力数据与 3D STEP 机械安装模型"
      },
      {
        id: "project_timeline",
        label: "项目进度与样品支持",
        tag: "项目推进",
        desc: "确认项目阶段与交付排期，提供首批验证动力总成支持"
      },
      {
        id: "avionics_interface",
        label: "电气接口与智能遥测",
        tag: "系统集成",
        desc: "探讨 DroneCAN 遥测、母线电压匹配与抗恶劣环境 IP66 特性"
      }
    ];
  },

  // 3. 生成 35~50 字符的主题行 (根据选定的策略动态适配，纯英文)
  generateSubjectLinesForStrategy: function (analysis, strategyId) {
    const name = analysis.callName || "there";
    const compShort = analysis.compShort || "your team";

    let options = [];

    switch (strategyId) {
      case "disqualify_polite":
        options = [
          { text: `Inquiry regarding IPET SYSTEM products`, label: "业务边界澄清 (礼貌官方)" },
          { text: `Regarding your inquiry to IPET SYSTEM, ${name}`, label: "官方回复确认 (高效澄清)" },
          { text: `IPET industrial UAV powertrain scope clarification`, label: "航空动力边界 (专业说明)" }
        ];
        break;
      case "disqualify_brief":
        options = [
          { text: `Regarding your recent inquiry to IPET, ${name}`, label: "极简业务说明 (直接归档)" },
          { text: `IPET SYSTEM powertrain inquiry follow-up, ${name}`, label: "业务范围答复 (简短清晰)" },
          { text: `Scope update on your inquiry to IPET SYSTEM`, label: "范围确认通知 (闭环归档)" }
        ];
        break;

      case "supplier_intake":
        options = [
          { text: `Packaging & wire bonding supplier intake (${name})`, label: "外协资质初审 (供应链切角)" },
          { text: `Supplier capabilities review for ${compShort}`, label: "加工能力初审 (供应商登记)" },
          { text: `IPET supply chain review for ${compShort}`, label: "业务自荐转交 (供应链直达)" }
        ];
        break;
      case "supplier_nda_review":
        options = [
          { text: `MNDA & technical review for ${compShort}`, label: "双向保密协议 (合规推进)" },
          { text: `Supplier qualification & NDA review (${name})`, label: "资质审核协议 (正式对接)" },
          { text: `IPET microelectronics sourcing & NDA review`, label: "微电子外协对接 (深度评估)" }
        ];
        break;
      case "supplier_decline":
        options = [
          { text: `Thank you for introducing ${compShort}`, label: "收录备选供应商 (礼貌存档)" },
          { text: `Supplier introduction follow-up, ${name}`, label: "供应商信息登记 (友好留存)" },
          { text: `IPET vendor database update for ${compShort}`, label: "合格名录登记 (商务归档)" }
        ];
        break;

      case "prototype_sourcing":
        options = [
          { text: `Precision prototype review at DroneX, ${name}`, label: "加工能力预审 (决策关注)" },
          { text: `Prototype supplier discussion for DroneX (${name})`, label: "样件外协评估 (供应链切角)" },
          { text: `IPET machining & prototype sourcing for ${compShort}`, label: "五金结构外协 (业务直达)" }
        ];
        break;
      case "pre_show_call":
        options = [
          { text: `Pre-DroneX intro call & prototype review, ${name}`, label: "展前线上会晤 (高效前置)" },
          { text: `Quick intro before DroneX Trade Show, ${name}`, label: "展前技术对齐 (对话感)" },
          { text: `Connecting before DroneX Trade Show (${name})`, label: "展前商务预约 (轻量切角)" }
        ];
        break;
      case "dronex_booth_meet":
        options = [
          { text: `DroneX Trade Show booth meeting with ${name}`, label: "展位会面预约 (推荐主力)" },
          { text: `Prototype cooperation at DroneX (${name})`, label: "展台技术对接 (商务正式)" },
          { text: `Meeting at IPET booth during DroneX, ${name}`, label: "展期日程锁定 (亲切高效)" }
        ];
        break;

      case "flight_testing":
        options = [
          { text: `Flight testing powertrain sizing for ${name}`, label: "试飞选型支持 (项目推进)" },
          { text: `${compShort} multirotor flight test powertrain`, label: "试飞排期匹配 (工程前置)" },
          { text: `IPET bench data for ${compShort} flight test, ${name}`, label: "台架数据对齐 (技术资产)" }
        ];
        break;
      case "oem_supply":
        options = [
          { text: `IPET powertrain OEM partnership for ${compShort}`, label: "OEM战略合作 (商业对话)" },
          { text: `Procurement inquiry for ${compShort} drone program`, label: "采购计划沟通 (商务推进)" },
          { text: `${compShort} multirotor propulsion supply, ${name}`, label: "批量供应保障 (决策人关注)" }
        ];
        break;
      case "procurement_intake":
        options = [
          { text: `Quick note on your procurement request, ${name}`, label: "采购需求直达 (对话感)" },
          { text: `${compShort} UAV project specifications & RFQ (${name})`, label: "规格文件接收 (商务前置)" },
          { text: `IPET powertrain point of contact for ${compShort}`, label: "专人对接联络 (官方确认)" }
        ];
        break;

      case "payload_vibration":
        options = [
          { text: `I7 low-vibration powertrain for ${name}`, label: "载荷低震动专向 (对话感)" },
          { text: `IPET I7 gimbal payload sizing (${name})`, label: "云台载荷匹配 (项目前置)" },
          { text: `I7 low-EMI bench data & 3D STEP for ${name}`, label: "电磁与台架数据 (技术资产)" }
        ];
        break;
      case "concept_eval":
        options = [
          { text: `Quick note on your I7 evaluation, ${name}`, label: "概念评估沟通 (对话感)" },
          { text: `IPET I7 concept feasibility for ${name}`, label: "可行性评估 (项目前置)" },
          { text: `I7 dyno curves & sample data for ${name}`, label: "打样与台架资产 (技术资产)" }
        ];
        break;
      case "sizing_dyno":
        options = [
          { text: `Quick question on your I7 setup, ${name}`, label: "推荐主力 (工程师1对1对话感)" },
          { text: `IPET I7 propulsion sizing for ${name}`, label: "动力选型前置 (移动端首选)" },
          { text: `IPET I7 bench dyno data & STEP models`, label: "技术资产交付 (研发偏爱)" }
        ];
        break;

      case "heavy_lift_sizing":
        options = [
          { text: `Quick question on your I8 drone, ${name}`, label: "推荐主力 (工程师1对1对话感)" },
          { text: `Heavy-lift I8 powertrain sizing (${name})`, label: "动力选型前置 (移动端首选)" },
          { text: `IPET I8 bench curves & 3D CAD for ${name}`, label: "技术资产交付 (研发偏爱)" }
        ];
        break;
      case "coaxial_redundancy":
        options = [
          { text: `Coaxial X8 redundancy & dyno sweeps (${name})`, label: "共轴冗余匹配 (可靠性切角)" },
          { text: `IPET heavy-lift propulsion safety for ${compShort}`, label: "动力冗余保障 (技术前置)" },
          { text: `Single-motor failure safety & dyno for ${name}`, label: "单轴失效保全 (工程硬核)" }
        ];
        break;
      case "commercial_sample":
        options = [
          { text: `I8 evaluation samples & pilot batch for ${name}`, label: "样机申请推进 (商务切角)" },
          { text: `Sample delivery & DroneCAN telemetry, ${name}`, label: "交付排期对齐 (快速推进)" },
          { text: `IPET I8 powertrain batch lead time for ${compShort}`, label: "批产排期确认 (采购关切)" }
        ];
        break;

      case "project_timeline":
        options = [
          { text: `Powertrain flight test schedule for ${name}`, label: "试飞排期支持 (项目推进)" },
          { text: `Sample evaluation lead times for ${compShort}`, label: "样品交付排期 (商务跟进)" },
          { text: `UAV project milestones & powertrain, ${name}`, label: "项目里程碑 (协同推进)" }
        ];
        break;
      case "avionics_interface":
        options = [
          { text: `DroneCAN telemetry & ESC integration (${name})`, label: "智能遥测对接 (系统集成)" },
          { text: `IP66 powertrain bus architecture for ${name}`, label: "防护与电气架构 (技术资产)" },
          { text: `Avionics interface & dyno data for ${compShort}`, label: "电气协议支持 (研发偏爱)" }
        ];
        break;
      case "standard_sizing":
      default:
        options = [
          { text: `Quick question on your UAV project, ${name}`, label: "推荐主力 (工程师1对1对话感)" },
          { text: `UAV powertrain sizing report for ${name}`, label: "动力选型前置 (移动端首选)" },
          { text: `Bench dyno data & 3D STEP models for ${name}`, label: "技术资产交付 (研发偏爱)" }
        ];
        break;
    }

    return options.map(opt => {
      let text = opt.text.replace(/[\u4e00-\u9fa5]+/g, "").trim();
      if (text.length > 50) {
        text = text.slice(0, 50).trim();
      } else if (text.length < 35) {
        text = (text + " - IPET Team").slice(0, 50);
      }
      return {
        ...opt,
        text: text,
        charCount: text.length
      };
    });
  },

  // 4. 生成高度独特性、完全针对询盘定制的英文正文 (100% 纯英文，绝无任何中文字符)
  generateCustomEmailBody: function (analysis, strategyId, subjectText) {
    const name = analysis.callName || "there";
    const comp = analysis.cleanEnglishCompany || "your team";
    const compShort = analysis.compShort || "your team";
    const p = analysis.detectedParams || {};
    const englishAirframe = analysis.englishAirframe || "multirotor airframe";

    let body = "";

    // 类别 1: 误触红线 / 无效线索 (DISQUALIFIED)
    if (analysis.isDisqualified || strategyId === "disqualify_polite" || strategyId === "disqualify_brief") {
      if (strategyId === "disqualify_brief") {
        body = `Hi ${name},

Thank you for contacting IPET SYSTEM.

Our product portfolio is dedicated strictly to commercial and defense-grade industrial UAV powertrains (brushless motors, FOC speed controllers, and matched carbon propellers). We do not produce consumer electronics, hobby gadgets, or pet-related products.

We will archive this inquiry on our end. Please feel free to reach back out if your organization initiates an industrial drone development program in the future.

Best regards,

Customer Inquiries Desk
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
      } else {
        body = `Hi ${name},

Thank you for reaching out to IPET SYSTEM.

To clarify our engineering focus: IPET SYSTEM is a specialized developer and manufacturer of industrial-grade UAV propulsion assemblies—including high-torque brushless motors, high-voltage FOC speed controllers, and precision carbon fiber propellers—engineered exclusively for heavy-lift commercial, agricultural, and defense-grade unmanned aircraft.

Because our manufacturing and engineering resources are dedicated strictly to industrial aerospace powertrains, we do not produce consumer gadgets, pet products, or general consumer goods.

If your organization has an active industrial drone or aerospace propulsion program, please feel free to share your flight requirements and our application engineering team will be pleased to assist. Otherwise, we appreciate your interest and wish you success with your projects.

Best regards,

Application Engineering Desk
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
      }
    }

    // 类别 2: 外部服务商 / 供应商自荐 (SUPPLIER)
    else if (analysis.isSupplierPitch || strategyId === "supplier_intake" || strategyId === "supplier_nda_review" || strategyId === "supplier_decline") {
      if (strategyId === "supplier_nda_review") {
        body = `Hi ${name},

Thank you for reaching out regarding microelectronics packaging and assembly cooperation with ${comp}.

Because our proprietary ESC inverter layouts, gate-driver packaging, and thermal substrates involve proprietary hardware architecture, our standard procurement policy requires a mutual non-disclosure agreement prior to sharing packaging outlines or assembly drawings.

We can execute a mutual NDA (MNDA) within 24 hours. Please feel free to forward your company's standard MNDA template to this email thread, or let us know and we will forward ours right away.

Once executed, our hardware engineering team will review:
1. Bonding wire metallurgy and wire diameters (e.g., heavy aluminum or gold wire bonding for power MOSFET interconnects).
2. Substrate thermal dissipation requirements and potting/encapsulation tolerances.
3. Sample verification schedule for upcoming hardware iterations.

Looking forward to reviewing your credentials and exploring cooperation.

Best regards,

Hardware Engineering & Vendor Management Desk
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
      } else if (strategyId === "supplier_decline") {
        body = `Hi ${name},

Thank you for introducing ${comp}'s microelectronics packaging and wire bonding capabilities to IPET SYSTEM.

We have reviewed your profile and logged ${compShort}'s capabilities into our vendor management repository. At this immediate stage, our contract manufacturing and packaging allocations for our current generation of ESCs and power modules are committed with existing audited partners.

However, as we expand our next-generation high-voltage powertrain programs, we routinely evaluate new manufacturing partners for pilot runs. We will retain your technical contact details on file and reach out as soon as a suitable RFQ arises.

Thank you again for reaching out, and we wish ${comp} continued success.

Best regards,

Strategic Sourcing & Vendor Operations
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
      } else {
        body = `Hi ${name},

Thank you for contacting IPET SYSTEM regarding ${comp}'s capabilities in microelectronics packaging, wire bonding, and component assembly.

As an industrial UAV powertrain developer, our hardware relies on high-reliability electronics—specifically multi-layer power boards, high-current MOSFET power stages, and specialized gate-driver packaging capable of withstanding high thermal cycles and airborne vibration.

We have forwarded your contact information to our Supply Chain & Hardware Engineering desk. To assist our technical procurement team in logging ${compShort} into our qualified vendor evaluation database:

1. Could you share your standard capability line card or line equipment summary (e.g., wire bonding pitch, package types, automated optical inspection)?
2. What quality management certifications does your facility hold (e.g., ISO 9001, AS9100, or IATF 16949)?
3. What are your typical NRE and turnaround lead times for pilot-batch packaging runs (e.g., 20–100 prototype units)?
4. Are your packaging and assembly operations NDAA / TAA compliant?

Please feel free to attach your technical presentation or capability overview to this email thread. If a suitable engineering package matches your capabilities, our hardware procurement team will reach out directly.

Best regards,

Hardware Sourcing & Supply Chain Team
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
      }
    }

    // 类别 3: 展会现场会面与打样初审 (TRADESHOW - DroneX)
    else if (analysis.isTradeShowMeeting || analysis.isPrototypeSupplier || strategyId === "dronex_booth_meet" || strategyId === "prototype_sourcing" || strategyId === "pre_show_call") {
      if (strategyId === "prototype_sourcing") {
        body = `Hi ${name},

Thank you for contacting IPET SYSTEM regarding potential prototype manufacturing cooperation ahead of the DroneX Trade Show.

We continuously evaluate precision CNC machining and rapid prototyping partners capable of delivering tight-tolerance UAV propulsion components—specifically thin-walled 7075-T6 aluminum rotor bells, dynamic stator bases, and carbon composite fixtures with strict concentricity requirements.

We would be pleased to explore potential cooperation with ${compShort} at DroneX. To help our sourcing desk evaluate synergy ahead of our booth meeting:

1. What are your core in-house machining capabilities (e.g., 3-axis / 4-axis / 5-axis CNC milling, high-speed turning, wire EDM)?
2. What standard tolerances and surface treatments (e.g., hard anodizing, passivation) do you routinely achieve on aerospace/UAV structural parts?
3. What is your typical turnaround time for high-precision prototype trial runs (e.g., 5–10 sets of prototype motor shells)?
4. What metrology equipment does your QA team utilize (e.g., Zeiss CMM, optical contour projectors)?

Please let us know your preferred meeting schedule at DroneX so we can coordinate our engineering calendar accordingly.

Best regards,

Supply Chain & Engineering Sourcing Desk
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
      } else if (strategyId === "pre_show_call") {
        body = `Hi ${name},

Thank you for your message. We would be pleased to connect with ${compShort} during the DroneX Trade Show.

Because trade show schedules can get quite hectic on the exhibition floor, we often find it productive to align on basic technical capabilities beforehand. That way, when we meet at the IPET booth, our conversation can focus directly on actionable prototype opportunities and specific RFQs.

Could your team accommodate a brief 15-minute introductory call early next week (via Teams or Zoom)?

During this brief intro, we can:
1. Introduce IPET's current roadmap for new-generation UAV motor prototypes and housing machining demands.
2. Review ${compShort}'s machinery portfolio, lead times, and quality management certifications (e.g., ISO 9001).
3. Confirm our exact booth location and lock in an in-person meeting slot at DroneX.

If you have a capability line card or presentation deck, please feel free to send it across. Looking forward to speaking soon and seeing you at DroneX.

Best regards,

Business Development & Technical Sourcing Desk
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
      } else {
        body = `Hi ${name},

Thank you for reaching out. We are glad to hear that ${comp} will also be attending the DroneX Trade Show.

Our engineering and commercial leadership will be on-site at the IPET SYSTEM booth throughout the show. As an industrial UAV powertrain developer, precision CNC machining, tight dimensional tolerances, and high-quality anodizing for our motor housings, rotor bells, and carbon arm mounts are critical to our manufacturing standards. We would certainly welcome the opportunity to discuss potential prototype fabrication and component machining cooperation.

To ensure our technical director and sourcing team have dedicated time reserved for you without conflicting with customer live demonstrations, what day and time window would work best for your team?

- Show Day 1: Morning (10:30–12:00) or Afternoon (14:00–16:00)
- Show Day 2: Morning (10:30–12:00) or Afternoon (13:30–15:30)

In the meantime, feel free to share a brief equipment overview, machine tolerance sheet, or company presentation to this email thread so our engineering desk can review your capabilities prior to the show.

Looking forward to meeting in person at DroneX.

Best regards,

Technical Sourcing & Business Development Team
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
      }
    }

    // 类别 4: 重载动力系统 (I8 / 50kg+ MTOW / Heavy-Lift)
    else if (analysis.isHeavyLift || analysis.productCode === "I8" || strategyId === "heavy_lift_sizing" || strategyId === "coaxial_redundancy" || strategyId === "commercial_sample") {
      if (strategyId === "coaxial_redundancy") {
        body = `Hi ${name},

Thank you for contacting IPET SYSTEM regarding heavy-lift propulsion for ${comp}.

When deploying heavy payloads on industrial multirotors, system-level redundancy is non-negotiable. The IPET I8 propulsion system is engineered specifically for Coaxial X8 configurations, where bottom-motor dynamic compensation and single-rotor failure containment are critical.

Key architectural features of our Coaxial X8 pairing:
- Asymmetric upper/lower propeller pitch optimization to recover swirl energy and maintain high aerodynamic efficiency in turbulent wash.
- Ultra-fast FOC response time (<50ms) to instantly counteract torque yaw when a single rotor or ESC fails.
- Validated in our 316-minute continuous endurance bench runs under elevated ambient temperatures.

To help our engineering desk provide a validated coaxial thrust distribution table:
1. What is your target total MTOW and per-arm coaxial thrust requirement?
2. What is your airframe arm tube diameter or motor mount bolt circle specification?
3. Would your avionics benefit from DroneCAN real-time RPM, voltage, and MOSFET thermal telemetry logging on every rotor axis?

We can share our coaxial bench test datasets and 3D CAD models right away so your team can verify clearance.

Best regards,

Flight Systems & Propulsion Engineering Team
IPET SYSTEM | Heavy-Lift & Industrial UAV Powertrains
https://ipetsystem.com`;
      } else if (strategyId === "commercial_sample") {
        body = `Hi ${name},

Thank you for your inquiry regarding the IPET I8 heavy-lift propulsion system for ${comp}.

We understand that for industrial UAV OEM programs, moving smoothly from bench testing to flight-qualified pilot batches requires reliable sample lead times and repeatable manufacturing consistency.

To support ${compShort}'s evaluation and production milestones:
- We maintain pre-calibrated evaluation sample sets (Motor + FOC ESC + Carbon Propeller) ready for rapid dispatch.
- Each production batch includes individual dynamometer test calibration sheets ensuring thrust and Kv consistency within +/-1.5%.
- Full DroneCAN protocol documentation and GUI configuration tools are included for immediate plug-and-play flight controller integration.

Could you confirm a few operational details so we can reserve sample allocation:
1. How many evaluation sample sets does your team need for initial bench testing and flight trials?
2. What is ${compShort}'s target testing timeline or date for maiden flight trials?
3. What is your estimated annual production volume following flight validation (e.g., 50–200 sets/year)?

Looking forward to supporting your heavy-lift drone program.

Best regards,

OEM Commercial & Technical Sourcing Desk
IPET SYSTEM | Heavy-Lift & Industrial UAV Powertrains
https://ipetsystem.com`;
      } else {
        const pDetails = [];
        if (p.mtow) pDetails.push(`target MTOW around ${p.mtow}`);
        if (p.payload) pDetails.push(`payload envelope of ${p.payload}`);
        if (p.voltage) pDetails.push(`operating bus voltage of ${p.voltage}`);
        const pContext = pDetails.length > 0 ? `We noted your platform targets (${pDetails.join(", ")}). ` : "";

        body = `Hi ${name},

Received your note regarding the IPET I8 heavy-lift powertrain integration for ${comp}.

For heavy-lift industrial and cargo UAVs, continuous thermal headroom and hover electrical efficiency are the decisive factors. The IPET I8 system (factory-matched motor + 100A FOC ESC + 34"–36" carbon propellers) delivers up to 12.1 g/W hover efficiency at 4.0 kg thrust, engineered around a high-voltage 14S–18S architecture to minimize copper loss and ESC heating during heavy-duty sorties.

${pContext}To calculate the exact operating point and payload-endurance tradeoff for your platform:

1. Target payload weight & estimated MTOW (e.g., 10–15 kg payload / ~32–36 kg MTOW, or 20 kg+ payload / ~45–65 kg MTOW)?
2. Redundancy configuration (e.g., Coaxial X8 for single-motor failure safety, or standard Hexacopter/Octocopter)?
3. Target mission profile and hover endurance (e.g., 35–45 minutes with full payload)?
4. Desired avionics interface (e.g., DroneCAN telemetry with real-time MOSFET thermal feedback, or PWM)?

Once you share your target envelope, our engineering team will pull the matching thrust-to-power dyno curves and deliver our 3D CAD STEP package for mechanical integration.

Best regards,

Application Engineering Team
IPET SYSTEM | Heavy-Lift & Industrial UAV Powertrains
https://ipetsystem.com`;
      }
    }

    // 类别 5: 云台载荷与 Gremsy / I7 询盘
    else if (analysis.isGimbalPayload || analysis.productCode === "I7" || strategyId === "sizing_dyno" || strategyId === "concept_eval" || strategyId === "payload_vibration") {
      if (strategyId === "payload_vibration") {
        body = `Hi ${name},

Received your note regarding the IPET I7 motor, ESC, and propeller integration for ${comp}.

Given ${compShort}'s reputation in three-axis stabilized gimbals and optical payloads, we know that motor cogging torque, propeller balance tolerance, and ESC switching harmonics directly affect gimbal stabilization margins and sensor sharpness.

The IPET I7 integrated powertrain is built specifically to address this:
- Integrated FOC sine-wave ESC with ultra-low EMI radiation and shielded DroneCAN telemetry.
- Dynamic balance grading under 0.05 mm/s on factory-matched 28"–30" carbon blades.
- Nominal hover operating point at 3.0–4.5 kg thrust per axis on a 12S bus (~44.4V–50.4V), providing low thermal rise during extended station-keeping.

As you are currently in the Concept Evaluation stage for a ${englishAirframe}, could you share a few quick parameters to help us evaluate mechanical and electrical pairing:

1. Airframe layout under evaluation (e.g., customized multirotor, coaxial platform, or gimbal test carrier)?
2. Estimated MTOW and target hover thrust per axis (e.g., ~12–16 kg MTOW Quad, or ~18–24 kg Hexa)?
3. Telemetry protocol preference (e.g., DroneCAN for real-time RPM, bus current, and ESC temperature logging, or standard PWM)?
4. Maximum propeller diameter constraints or overall frame footprint limits?

We have the complete I7 vibration spectral analysis reports, bench dyno sweeps (Thrust vs. RPM vs. Electrical Power), and native 3D STEP models ready. I would be glad to send the direct download package so your engineering team can review clearance with your gimbal payload envelope.

Best regards,

Application Engineering Team
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
      } else if (strategyId === "concept_eval") {
        body = `Hi ${name},

Thank you for reaching out regarding the IPET I7 powertrain package (motor + ESC + propeller) for your concept evaluation at ${comp}.

Since your team is exploring a specialized configuration in the concept evaluation phase, our propulsion engineering group can help accelerate your evaluation timeline by providing pre-characterized bench data and mechanical CAD models.

The IPET I7 is an integrated, factory-matched powertrain (motor, 80A FOC ESC, and folding/direct-mount carbon propeller) optimized for 12S LiPo operation, with a peak dynamic thrust of ~8.5 kg per axis and nominal hover operating points around 3.5 kg/axis. Its compact integrated design eliminates external motor-ESC wiring, simplifying airframe cable routing.

To align with your concept evaluation schedule and provide an accurate sizing sheet:

1. What is the target weight class or payload capacity you are evaluating (e.g., 2–4 kg sensor payload / ~14 kg MTOW)?
2. Do you have specific mechanical mounting interface constraints (e.g., standard motor bolt pitch or custom arm clamps)?
3. What is your team's target timeline for bench testing evaluation samples at ${compShort}?

I can provide our I7 3D CAD STEP assembly package right away so your mechanical designers can drop it directly into your CAD workspace to verify fitment and structural clearances.

Best regards,

Application Engineering Team
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
      } else {
        body = `Hi ${name},

Received your note regarding the IPET I7 motor, ESC, and propeller integration for your upcoming project at ${comp}.

For precision gimbal and sensor applications, propulsion thermal stability, vibration harmonic suppression, and low electromagnetic interference (EMI) from the ESC are governing design constraints. The IPET I7 integrated powertrain is factory-matched with dynamically balanced 28"–30" carbon propellers and an integrated FOC vector ESC, delivering 3.0–4.5 kg nominal hover thrust per axis (typically configured for 12–16 kg MTOW Quads or 18–24 kg MTOW Hexacopters on 12S).

As you are currently in the concept evaluation stage for this ${englishAirframe}, could you share a few quick baseline parameters:

1. Target airframe concept & estimated MTOW (e.g., customized multirotor, coaxial platform, or gimbal test carrier)?
2. Target operating voltage and battery setup (e.g., standard 12S ~48V LiPo/Li-ion)?
3. Avionics telemetry protocol (e.g., DroneCAN for real-time RPM, bus current, and ESC temperature monitoring, or PWM)?
4. Maximum propeller diameter constraints or target hover endurance?

We have the native 3D CAD STEP models and complete bench dyno curves (Thrust vs. RPM vs. Power vs. Efficiency) ready for the I7. I would be glad to send the direct download links so your mechanical and systems team can evaluate physical packaging and electrical sizing directly.

Best regards,

Application Engineering Team
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
      }
    }

    // 类别 6: 商业采购对接 (Procurement RFQ)
    else if (analysis.isProcurementRFQ || strategyId === "procurement_intake" || strategyId === "flight_testing" || strategyId === "oem_supply") {
      if (strategyId === "flight_testing") {
        body = `Hi ${name},

Thank you for reaching out regarding propulsion procurement for ${comp}.

We noted that your platform is in the flight testing stage. During flight trials, reliable delivery lead times, predictable thrust margins, and real-time powertrain telemetry are essential to keeping your test flight schedule on track.

You have reached our direct Application Engineering and Propulsion Sourcing desk. You can send your project specifications, thrust targets, or airframe drawings directly to this email thread. If your technical files require a mutual NDA (MNDA), we can countersign within 24 hours.

To help our technical team prepare an immediate powertrain matching package while your team gathers the specification files:

1. What is the target MTOW and per-axis hover thrust requirement for this platform (e.g., 3.5–4.5 kg hover thrust per axis on 12S)?
2. Do you have specific dimensional envelopes (maximum propeller diameter) or arm-clamp mounting constraints?
3. How many bench and flight-testing sample sets do you require for initial envelope expansion, and what is your target test date?
4. Would your flight controller benefit from DroneCAN real-time bus telemetry (ESC RPM, voltage, current, and MOSFET thermal logging during sorties)?

We keep flight-ready integrated powertrain packages (Motor + FOC ESC + Carbon Propellers) in stock for rapid dispatch to flight testing programs. Looking forward to reviewing your specifications.

Best regards,

Application Engineering & OEM Sourcing Team
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
      } else if (strategyId === "oem_supply") {
        body = `Hi ${name},

Thank you for reaching out to IPET SYSTEM. We would welcome the opportunity to establish a long-term, mutually beneficial business relationship and supply framework with ${comp}.

You have reached our direct OEM Accounts and Technical Procurement desk. You can forward your procurement request, volume forecasts, and technical specification sheet directly to this email address. If your team requires a mutual NDA before releasing documentation, please let us know and we will execute our standard MNDA or countersign yours immediately.

To help our commercial and operations team structure an initial OEM proposal:

1. What is your projected unit volume roadmap (e.g., initial evaluation sets for flight testing, followed by pilot batches of 50–200 sets/year)?
2. What are the key baseline performance parameters for this airframe (target MTOW, payload capacity, and operating bus voltage)?
3. What is ${compShort}'s required target delivery timeline for initial qualification units?
4. Do you require custom motor branding, customized cable harness lengths, or specific supply chain compliance documentation?

IPET SYSTEM provides end-to-end industrial powertrain manufacturing, individualized dynamometer test reports per batch, and dedicated engineering support. We look forward to receiving your specifications and discussing terms.

Best regards,

OEM Accounts & Commercial Procurement Desk
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
      } else {
        body = `Hi ${name},

Thank you for contacting IPET SYSTEM regarding propulsion procurement for ${comp}'s upcoming project.

To answer your inquiry directly: you have reached our direct Application Engineering and OEM Procurement group. You can forward your project specifications, thrust target sheets, or CAD requirements directly to this email address.

If your documentation contains proprietary airframe dimensions, mission payload data, or confidential procurement terms, we are glad to execute a mutual NDA (MNDA) immediately. Please feel free to send over your standard agreement, or let us know and we will forward ours right away.

We noted that your team is actively developing an ${englishAirframe}. To ensure our engineering desk can evaluate your requirements with zero latency once the files arrive:

1. Could you confirm the target MTOW class and estimated hover thrust per axis (e.g., 12–16 kg MTOW Quad, or 30–50 kg+ heavy-lift)?
2. What operating bus voltage is your battery architecture designed around (e.g., 12S ~48V, or 14S/18S high-voltage system)?
3. What is ${compShort}'s target timeline for receiving bench evaluation samples for flight trial integration?
4. What is the preferred motor-ESC communication interface (DroneCAN telemetry or standard PWM)?

Once we receive your specifications, our engineering team will provide a tailored propulsion sizing assessment, dynamometer curves (Thrust vs. RPM vs. Power vs. Efficiency), and native 3D STEP models within 1–2 business days.

Best regards,

Application Engineering & OEM Procurement Team
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
      }
    }

    // 类别 7: 通用工业级无人机整机动力总成 (Standard OEM / Low-Info)
    else if (strategyId === "project_timeline") {
      body = `Hi ${name},

Thank you for reaching out regarding powertrain integration for ${comp}'s UAV program.

To help your team meet your development and flight testing milestones without propulsion lead-time bottlenecks, our engineering desk offers priority sample allocation and dedicated integration support.

To align our production scheduling with your program timeline:
1. What is your target milestone date for initial bench testing and prototype flight trials?
2. How many prototype evaluation powertrains (Motor + ESC + Propeller) will you require for initial envelope expansion?
3. What is your target airframe layout and estimated MTOW class?
4. Does your team require mutual NDA execution before sharing your airframe CAD or thrust targets?

We can dispatch pre-characterized engineering samples and 3D STEP models promptly to ensure zero delay to your flight test schedule.

Best regards,

Program Management & Application Engineering
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
    } else if (strategyId === "avionics_interface") {
      body = `Hi ${name},

Thank you for your inquiry regarding IPET SYSTEM industrial UAV propulsion for ${comp}.

For modern commercial drone platforms, robust avionics communication and environmental durability are just as vital as aerodynamic thrust. Our integrated powertrains are designed from the ground up for mission-critical industrial deployment:
- Real-time DroneCAN bus telemetry streaming motor RPM, bus voltage, phase current, and ESC power-stage temperatures directly to your flight controller.
- Field-Oriented Control (FOC) vector drive providing whisper-quiet operation, ultra-fast throttle response, and minimal electromagnetic interference (EMI).
- Full IP66 environmental sealing protecting bearings, windings, and ESC circuitry against heavy rain, dust, and coastal humidity.

To ensure complete electrical and physical compatibility with your avionics architecture:
1. What flight controller and autopilot firmware are you utilizing (e.g., PX4, ArduPilot, or proprietary)?
2. What is your system operating bus voltage (e.g., 12S ~48V, or 14S/18S high-voltage)?
3. What is the target MTOW and propeller clearance envelope for this airframe?

We would be glad to share our DroneCAN telemetry integration guide, wiring schematics, and 3D STEP files right away.

Best regards,

Avionics & Systems Integration Team
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
    } else {
      const hasSpecifics = p.mtow || p.voltage || p.payload || (analysis.uavTypeCode && analysis.uavTypeCode !== "OTHER" && analysis.uavTypeCode !== "STANDARD") || (analysis.stageCode && analysis.stageCode !== "RND");

      let contextIntro = "";
      if (hasSpecifics) {
        const details = [];
        if (p.mtow) details.push(`target MTOW around ${p.mtow}`);
        if (p.payload) details.push(`payload envelope of ${p.payload}`);
        if (p.voltage) details.push(`operating bus voltage of ${p.voltage}`);
        if (analysis.uavTypeCode && analysis.uavTypeCode !== "OTHER" && analysis.uavTypeCode !== "STANDARD") details.push(`${englishAirframe}`);
        if (analysis.stageCode === "FLIGHT_TEST") details.push("active flight test integration schedule");
        contextIntro = `We noted your platform targets (${details.join(", ")}). `;
      }

      const questions = [];
      let qNum = 1;

      if (!p.mtow && !p.payload) {
        questions.push(`${qNum++}. Target payload weight & estimated MTOW (e.g., 5–8 kg payload / ~16–22 kg MTOW, or 15–25 kg payload / ~40–55 kg MTOW)?`);
      }
      if (!analysis.uavTypeCode || analysis.uavTypeCode === "OTHER" || analysis.uavTypeCode === "STANDARD") {
        questions.push(`${qNum++}. Airframe configuration (e.g., Quadcopter, Hexacopter, or Coaxial X8 for single-motor redundancy)?`);
      }
      if (!p.voltage) {
        questions.push(`${qNum++}. Target battery operating voltage (e.g., standard 12S ~48V, or 14S/18S high-voltage LiPo/Li-ion)?`);
      }
      questions.push(`${qNum++}. Avionics telemetry protocol preference (e.g., DroneCAN for real-time RPM, bus current, and ESC temperature logging, or standard PWM)?`);
      questions.push(`${qNum++}. Maximum allowable propeller diameter constraints or target hover endurance?`);

      const questionsText = questions.slice(0, 4).join("\n");

      body = `Hi ${name},

Received your note regarding industrial UAV propulsion for ${comp}.

${contextIntro}At IPET SYSTEM, our integrated powertrains (factory-matched Motor + FOC ESC + Carbon Propeller) are characterized across comprehensive dynamometer sweeps to deliver optimal hover efficiency, with full DroneCAN bus telemetry and IP66 environmental sealing.

To ensure our engineering team prepares the most accurate propulsion sizing report and native 3D CAD STEP models for your platform:

${questionsText}

Once you have a moment to share rough estimates, our application engineering desk will prepare a tailored propulsion sizing sheet along with 3D CAD models within 1 business day.

Best regards,

Application Engineering Team
IPET SYSTEM | Industrial UAV Powertrains
https://ipetsystem.com`;
    }

    // 终极防线：绝对纯英文保证，彻底过滤任何中文字符与空括号
    let sanitized = body
      .replace(/[\u4e00-\u9fa5]+/g, "")
      .replace(/\(\s*\)/g, "")
      .replace(/\[\s*\]/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return sanitized;
  }
};

// 全局挂载与模块导出
if (typeof window !== 'undefined') {
  window.InquiryResponder = InquiryResponder;
  window.isInvalidCustomerName = isInvalidCustomerName;
  window.extractHumanNameFromEmail = extractHumanNameFromEmail;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    InquiryResponder,
    isInvalidCustomerName,
    extractHumanNameFromEmail
  };
}
