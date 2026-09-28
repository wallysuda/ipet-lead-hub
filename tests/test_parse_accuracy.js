/**
 * 内容识别准确性验收测试 · node tests/test_parse_accuracy.js
 * 目标：多渠道/多语言询盘必须稳定抽出身份、联系方式、需求、参数。
 * 任何一项 FAIL = 不可外发链接。
 */

const assert = require('assert');
const path = require('path');
const mod = require('../js/normalizer.js');
const Normalizer = mod.parseFreeText ? mod : (mod.Normalizer || Object.values(mod).find(x => x && x.parseFreeText));
const { InquiryResponder } = require('../js/inquiry_responder.js');

function parse(text, hint) {
  return Normalizer.parseFreeText(text, hint || '');
}

function expect(lead, want, label) {
  const problems = [];
  for (const [k, v] of Object.entries(want)) {
    if (v instanceof RegExp) {
      const actual = String(lead[k] ?? '');
      if (!v.test(actual)) problems.push(`${k}: got ${JSON.stringify(actual.slice(0, 80))} want ${v}`);
    } else if (v === null || v === '') {
      if (lead[k]) problems.push(`${k}: expected empty, got ${JSON.stringify(lead[k])}`);
    } else if (typeof v === 'string') {
      const actual = String(lead[k] ?? '');
      if (!actual.includes(v) && actual !== v) {
        problems.push(`${k}: got ${JSON.stringify(actual.slice(0, 80))} want contains ${JSON.stringify(v)}`);
      }
    } else if (typeof v === 'function') {
      const ok = v(lead);
      if (!ok) problems.push(`${k}: custom check failed. lead=${JSON.stringify({ name: lead.name, email: lead.email, company: lead.company, req: String(lead.raw_requirements||'').slice(0,60) })}`);
    }
  }
  if (problems.length) {
    throw new Error(`[${label}] ${problems.join(' | ')}`);
  }
}

function expectParam(lead, key, want, label) {
  const p = lead.detected_params || lead.technical_parameters || {};
  const actual = String(p[key] || '');
  if (want instanceof RegExp) {
    if (!want.test(actual)) throw new Error(`[${label}] param.${key}=${JSON.stringify(actual)} want ${want}`);
  } else if (!String(actual).includes(want)) {
    throw new Error(`[${label}] param.${key}=${JSON.stringify(actual)} want ${JSON.stringify(want)}`);
  }
}

const cases = [];

function add(name, text, want, paramWant, hint) {
  cases.push({ name, text, want, paramWant, hint });
}

// ---------- LinkedIn ----------
add('linkedin_facebook_style_long', `What is the MTOW of your UAV?: 50kg
Full name: 주상용
Company name: 블루스카이
What is the primary application of your UAV?: 농업용 드론
What stage is your project currently in?: Development / Prototyping
Tell us about your propulsion requirements.: 최대이륙중량 50kg
Email: jsy3723@naver.com
WhatsApp number: +821099343111`, {
  name: '주상용',
  email: 'jsy3723@naver.com',
  company: '블루스카이',
  phone: /821099343111/
}, { mtow: /50/ });

add('linkedin_first_last_name', `First Name: Ken
Last Name: Park
Work Email: ken@droneco.com
Company: DroneCo
Job Title: CTO
What is your biggest challenge right now?: We need 65kg MTOW cargo drone powertrain, RFQ`, {
  name: 'Ken Park',
  email: 'ken@droneco.com',
  company: 'DroneCo',
  job_title: 'CTO',
  raw_requirements: /65kg MTOW cargo drone powertrain/i
}, { mtow: /65/ });

add('linkedin_full_name_message', `Full Name: Aishwarya Gahlot
Email Address: aishwerya.gahlot@soaringaero.com
Company Name: Soaring Aerospace
Job Title: Aeronautical Engineer
Message: 65kg heavy lift multirotor powertrain NDAA, flight testing, RFQ for dyno sheets`, {
  name: 'Aishwarya Gahlot',
  email: 'aishwerya.gahlot@soaringaero.com',
  company: 'Soaring Aerospace',
  job_title: 'Aeronautical Engineer',
  raw_requirements: /65kg heavy lift/i
}, { mtow: /65/ });

// ---------- WordPress / 官网 ----------
add('wp_cf7_cn', `your-name: 张伟
your-email: zhangwei@aerolab.cn
org-name: 蓝天航空科技
phone: 13800138000
your-message: 需要 40kg 起飞重量重载多旋翼动力系统，12S 电压，采购询价`, {
  name: '张伟',
  email: 'zhangwei@aerolab.cn',
  company: '蓝天航空科技',
  phone: /13800138000/,
  raw_requirements: /40kg|重载/
}, { mtow: /40/ });

add('wp_keyvalue_en', `Name: Marcus Vance
Email: m.vance@vancetech-aero.com
Company: VanceTech Aerospace
Project Requirements: 40kg MTOW coaxial heavy-lift powertrain, need dyno curves and STEP model, RFQ`, {
  name: 'Marcus Vance',
  email: 'm.vance@vancetech-aero.com',
  company: 'VanceTech Aerospace',
  raw_requirements: /40kg MTOW|dyno/i
}, { mtow: /40/ });

// ---------- 邮件 ----------
add('email_from_header', `From: Doug Geary <dgeary@firstlevelinc.com>
Subject: Supplier introduction

Hello we are microelectronics packaging supplier, wire bonding and SMT assembly. Can we send line card?`, {
  name: 'Doug Geary',
  email: 'dgeary@firstlevelinc.com',
  raw_requirements: /wire bonding|packaging/i
});

// ---------- WhatsApp / 聊天 ----------
add('whatsapp_free_text', `Hi this is Max from CargoCopter. We need 65kg MTOW cargo multirotor powertrain. 12S lipo. Quote please. Email max@cargocopter.com`, {
  name: l => /Max/i.test(l.name || ''),
  email: 'max@cargocopter.com',
  company: l => /CargoCopter/i.test(l.company || ''),
  raw_requirements: /65kg MTOW|powertrain/i
}, { mtow: /65/ });

// ---------- 表格粘贴 ----------
add('tab_table', `Name	Email	Company	Requirements
Alisha Li	sales01@jstth.com	JS Technology	Need catalog of industrial UAV motors and ESC datasheet`, {
  name: 'Alisha Li',
  email: 'sales01@jstth.com',
  company: 'JS Technology',
  raw_requirements: /catalog|datasheet|motor/i
});

// ---------- Facebook 长问题 ----------
add('fb_long_questions', `What is the MTOW of your UAV?: 42kg
Full name: Maria Chen
Company name: AeroLab Systems
What is the primary application of your UAV?: inspection drone
What stage is your project currently in?: Flight testing
Tell us about your propulsion requirements.: need quote for I8 heavy lift powertrain
Email: maria@aerolab.io
WhatsApp number: +1 555 0100`, {
  name: 'Maria Chen',
  email: 'maria@aerolab.io',
  company: 'AeroLab Systems',
  phone: /555/,
  raw_requirements: /quote|powertrain|inspection/i
}, { mtow: /42/ });

// ---------- 空表单不得编造 ----------
add('empty_form_no_fake', `LinkedIn Lead Gen Form
IPET SYSTEM Lead Form`, {
  name: '',
  email: '',
  company: '',
  raw_requirements: l => {
    const req = String(l.raw_requirements || '');
    const brief = (l.analysis_brief && l.analysis_brief['采购诉求']) || '';
    const fake = /大载重动力系统选型与商务对接|工业级重载飞行器平台/.test(brief + req);
    return !fake;
  }
});

// ---------- 中英混杂后台留言 ----------
add('mixed_cn_backend', `姓名: 李工
企业邮箱: li@uavtech.io
公司: 飞巡智能
职位: 系统工程师
联系电话: +86 139 0000 1111
留言内容: 正在做 25kg 农业植保无人机，需要电机电调选型，样品报价`, {
  name: '李工',
  email: 'li@uavtech.io',
  company: '飞巡智能',
  job_title: '系统工程师',
  phone: /139/,
  raw_requirements: /25kg|植保|选型/
}, { mtow: /25/ });

// ---------- 日文简单 ----------
add('jp_simple', `お名前: 田中太郎
メール: tanaka@skyworks.jp
会社名: 株式会社スカイワークス
内容: 50kg級 産業用ドローンの動力システムについて問い合わせ`, {
  name: l => /田中太郎/.test(l.name || '') || /tanaka/i.test(l.name || ''),
  email: 'tanaka@skyworks.jp',
  raw_requirements: /50kg|ドローン|動力/
});

// ---------- 自由叙述 ----------
add('free_narrative_en', `I am Sarah from Nordic Air Robotics. Looking for propulsion for a 30kg inspection drone. 6S battery preferred. Project in prototype stage. Email sarah@nordicair.no`, {
  name: l => /Sarah/i.test(l.name || ''),
  email: 'sarah@nordicair.no',
  company: l => /Nordic/i.test(l.company || ''),
  raw_requirements: /30kg|inspection|propulsion/i
}, { mtow: /30/ });


// ---------- 更多边界 ----------
add('linkedin_ads_csv_row', `Campaign Name: IPET I8 Whitepaper
First Name: Preeti
Last Name: Nair
Email: preeti.nair@baacoaluminum.cc
Company: Baaco Aluminum
Job Title: Purchasing Manager
What are your procurement needs?: wholesale catalog, procurement RFQ for industrial UAV power units`, {
  name: 'Preeti Nair',
  email: 'preeti.nair@baacoaluminum.cc',
  company: /Baaco/i,
  job_title: /Purchasing/i,
  raw_requirements: /catalog|procurement|wholesale/i
});

add('only_email_body', `Hello,

We are evaluating motors for a 28kg VTOL. Need ESC + prop matching and sample pricing.

Best,
Elena
elena@vtolworks.eu
VTOL Works GmbH`, {
  name: l => /Elena/i.test(l.name || ''),
  email: 'elena@vtolworks.eu',
  company: l => /VTOL/i.test(l.company || ''),
  raw_requirements: /28kg|VTOL|motor/i
}, { mtow: /28/ });

add('cn_paste_with_noise', `【官网留言】
时间: 2026-09-24 17:08
姓名: 王强
邮箱: wangqiang@dronefarm.cn
公司: 农飞科技
内容: 植保无人机 20kg 级动力，要报价和规格书
IP 地址: 1.2.3.4`, {
  name: '王强',
  email: 'wangqiang@dronefarm.cn',
  company: '农飞科技',
  raw_requirements: /植保|20kg|报价/
}, { mtow: /20/ });

add('colon_fullwidth', `姓名：陈晓
邮箱：chenxiao@skyview.cn
公司：天际视觉
需求：12S 多旋翼动力套装询价，约 15kg 载荷`, {
  name: '陈晓',
  email: 'chenxiao@skyview.cn',
  company: '天际视觉',
  raw_requirements: /12S|多旋翼|15kg/
});

// ---------- 运行 ----------

let pass = 0;
const failures = [];

for (const c of cases) {
  try {
    const lead = parse(c.text, c.hint || '');
    expect(lead, c.want || {}, c.name);
    if (c.paramWant) {
      for (const [k, v] of Object.entries(c.paramWant)) {
        expectParam(lead, k, v, c.name);
      }
    }
    // 有效买家样例至少要有邮箱或姓名
    if (c.name !== 'empty_form_no_fake' && !lead.email && !lead.name) {
      throw new Error(`[${c.name}] no identity extracted`);
    }
    // 分级不应把有效买家打成 G0（除非样例是噪音）
    if (c.name !== 'empty_form_no_fake') {
      const g = InquiryResponder.classifyIntent(lead);
      if (g.code === 'G0_PASS') {
        throw new Error(`[${c.name}] unexpected G0_PASS: ${g.label}`);
      }
    }
    pass++;
    console.log(`  OK  ${c.name}`);
  } catch (e) {
    failures.push(c.name + ' :: ' + e.message);
    console.log(`  FAIL ${c.name}`);
    console.log('       ', e.message);
  }
}

console.log(`\nParse accuracy: ${pass}/${cases.length} passed`);
if (failures.length) {
  console.log('\nFAILURES:');
  failures.forEach(f => console.log(' -', f));
  process.exit(1);
}
console.log('OK: test_parse_accuracy passed — 识别达标，可外发链接');
