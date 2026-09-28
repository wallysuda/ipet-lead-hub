/**
 * 跟进邮件质量测试 · node tests/test_email_quality.js
 * 短优先、针对性、格式规范。
 */
const assert = require('assert');
const { InquiryResponder } = require('../js/inquiry_responder.js');

function buildLead(over) {
  return {
    name: 'Maria Chen',
    email: 'maria@aerolab.io',
    company: 'AeroLab Systems',
    job_title: 'Propulsion Lead',
    raw_text: 'Need 42kg MTOW heavy lift hexacopter powertrain RFQ, flight testing, 12S',
    raw_requirements: 'Need 42kg MTOW heavy lift hexacopter powertrain RFQ, flight testing, 12S',
    jev_analysis: { tier: 'TIER_1_READY_RFQ', maturity_score: 4.5 },
    ...over
  };
}

function wordCount(s) {
  return (String(s).match(/[A-Za-z]+/g) || []).length;
}

function hasChinese(s) {
  return /[一-龥]/.test(String(s));
}

const lead = buildLead();
const analysis = InquiryResponder.analyzeLead(lead);
const strategies = InquiryResponder.getStrategies(analysis, lead);
const mainId = strategies[0] && strategies[0].id;
assert.ok(mainId, 'need a primary strategy');

// 1) 短信默认最短且可读
const shortBody = InquiryResponder.generateCustomEmailBody(analysis, mainId, 'Powertrain Sizing Package for Your Quad Airframe', { length: 'short' });
const standardBody = InquiryResponder.generateCustomEmailBody(analysis, mainId, 'Powertrain Sizing Package for Your Quad Airframe', { length: 'standard' });
const detailedBody = InquiryResponder.generateCustomEmailBody(analysis, mainId, 'Powertrain Sizing Package for Your Quad Airframe', { length: 'detailed' });

const wShort = wordCount(shortBody);
const wStd = wordCount(standardBody);
const wDet = wordCount(detailedBody);

assert.ok(wShort < wStd, `short (${wShort}) should be < standard (${wStd})`);
assert.ok(wStd < wDet, `standard (${wStd}) should be < detailed (${wDet})`);
assert.ok(wShort <= 90, `short body too long: ${wShort} words`);
assert.ok(wDet <= 220, `detailed body too long: ${wDet} words`);
console.log(`  OK  length ladder short=${wShort} standard=${wStd} detailed=${wDet}`);

// 2) 针对性：出现姓名/公司/关键参数
assert.ok(/Maria/i.test(shortBody), 'short must greet name');
assert.ok(/AeroLab/i.test(shortBody), 'short must mention company');
assert.ok(/42kg|MTOW/i.test(shortBody), 'short must reflect MTOW from inquiry');
console.log('  OK  personalization');

// 3) 格式规范
assert.ok(/Best regards,/i.test(shortBody), 'signature valediction');
assert.ok(/IPET SYSTEM/i.test(shortBody), 'signature brand');
assert.ok(!hasChinese(shortBody), 'short must be pure English');
assert.ok(!hasChinese(standardBody), 'standard must be pure English');
assert.ok(!hasChinese(detailedBody), 'detailed must be pure English');
console.log('  OK  format + pure English');

// 4) 校验函数
const subj = 'Powertrain Sizing Package for Your Quad Airframe';
const check = InquiryResponder.validateOutbound(subj, shortBody);
assert.ok(check.ok, 'validateOutbound should pass: ' + JSON.stringify(check.issues));
console.log('  OK  validateOutbound');

// 5) 缺参时短信会追问，且不超过 2 问
const thin = InquiryResponder.analyzeLead(buildLead({
  name: 'Eve',
  email: 'eve@x.com',
  company: 'EveAir',
  raw_text: 'drone powertrain interest',
  raw_requirements: 'drone powertrain interest',
  jev_analysis: {}
}));
const thinBody = InquiryResponder.generateCustomEmailBody(thin, 'need_info_questions', 'Quick requirements check for EveAir', { length: 'short' });
const questionMarks = (thinBody.match(/\?/g) || []).length;
assert.ok(questionMarks >= 1 && questionMarks <= 3, 'need_info should ask 1-3 questions, got ' + questionMarks);
assert.ok(wordCount(thinBody) <= 100, 'need_info short still bounded: ' + wordCount(thinBody));
console.log('  OK  need_info bounded');

// 6) 拒绝函仍然短
const decline = InquiryResponder.generateCustomEmailBody(analysis, 'decline_polite', 'Thank you for contacting IPET SYSTEM, Maria', { length: 'detailed' });
assert.ok(wordCount(decline) <= 120, 'decline stays short');
assert.ok(!hasChinese(decline), 'decline pure English');
console.log('  OK  decline short');

console.log('OK: test_email_quality passed');
