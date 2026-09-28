/**
 * 策略 × 篇幅 矩阵质检 · node tests/test_email_matrix.js
 * 按钮切换必须真的改变正文；正文必须有针对性、不是空话堆砌。
 */
const { InquiryResponder } = require('../js/inquiry_responder.js');

const leads = [
  {
    id: 'buyer',
    name: 'Maria Chen', email: 'maria@aerolab.io', company: 'AeroLab Systems', job_title: 'Propulsion Lead',
    raw_text: 'Need 42kg MTOW heavy lift hexacopter powertrain RFQ, flight testing, 12S',
    jev_analysis: { tier: 'TIER_1_READY_RFQ', maturity_score: 4.5 }
  },
  {
    id: 'thin',
    name: 'Eve Park', email: 'eve@eveair.com', company: 'EveAir',
    raw_text: 'hello drone powertrain', jev_analysis: { tier: 'TIER_3_EXPLORATORY', maturity_score: 1.8 }
  },
  {
    id: 'supplier',
    name: 'Ann Fab', email: 'ann@microfab.com', company: 'MicroFab',
    raw_text: 'microelectronics packaging wire bonding supplier', jev_analysis: {}
  },
  {
    id: 'consumer',
    name: 'Sam Hobby', email: 'sam@hobby.com', company: 'Hobby RC',
    raw_text: 'consumer toy drone kids hobby', jev_analysis: {}
  }
];

const lengths = ['short', 'standard', 'detailed'];
const BRIEF_STRATEGIES = new Set(['disqualify_brief', 'pass_archive']);

function words(s) { return (String(s).match(/[A-Za-z]+/g) || []).length; }
function hasChinese(s) { return /[一-龥]/.test(String(s)); }

const problems = [];

for (const lead of leads) {
  const analysis = InquiryResponder.analyzeLead(lead);
  const strategies = InquiryResponder.getStrategies(analysis, lead);
  if (!strategies.length) problems.push(lead.id + ': no strategies');

  const byStrategy = {};
  for (const strat of strategies) {
    const subjects = InquiryResponder.generateSubjectLinesForStrategy(analysis, strat.id);
    const subj = (subjects[0] && subjects[0].text) || 'Regarding your inquiry to IPET SYSTEM';
    byStrategy[strat.id] = {};

    for (const len of lengths) {
      const body = InquiryResponder.generateCustomEmailBody(analysis, strat.id, subj, { length: len });
      const w = words(body);
      byStrategy[strat.id][len] = body;
      const tag = `${lead.id}/${strat.id}/${len}`;

      if (!body || w < 15) problems.push(tag + ': too thin');
      if (hasChinese(body)) problems.push(tag + ': Chinese chars');
      if (!/IPET SYSTEM/i.test(body)) problems.push(tag + ': missing brand');
      if (!/Best regards,/i.test(body) && !/INTERNAL ARCHIVE/.test(body)) problems.push(tag + ': missing sign-off');

      const namePart = String(analysis.callName || '').split(' ')[0];
      if (!/INTERNAL ARCHIVE/.test(body) && namePart && namePart !== 'there' && !body.includes(namePart)) {
        problems.push(tag + ': not personalized');
      }

      const hasDecision = /\b(send|share|confirm|provide|archive|not able|cannot support|will not|review|counter-sign|contact|assist)\b/i.test(body);
      if (!hasDecision) problems.push(tag + ': no action/decision language');

      if (len === 'short' && !BRIEF_STRATEGIES.has(strat.id) && w > 95) {
        problems.push(tag + ': short too long ' + w);
      }
      if (len === 'detailed' && !BRIEF_STRATEGIES.has(strat.id) && w < 70) {
        problems.push(tag + ': detailed too thin ' + w);
      }
    }

    // 篇幅切换必须改变正文
    const s = byStrategy[strat.id].short;
    const m = byStrategy[strat.id].standard;
    const d = byStrategy[strat.id].detailed;
    if (!BRIEF_STRATEGIES.has(strat.id)) {
      if (s === m) problems.push(`${lead.id}/${strat.id}: short === standard`);
      if (m === d) problems.push(`${lead.id}/${strat.id}: standard === detailed`);
      if (words(s) >= words(d)) problems.push(`${lead.id}/${strat.id}: short not shorter than detailed`);
    }
  }

  // 同线索不同策略，detailed 不能长一样
  const ids = Object.keys(byStrategy);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = byStrategy[ids[i]].detailed || '';
      const b = byStrategy[ids[j]].detailed || '';
      if (a && a === b) problems.push(`${lead.id}: ${ids[i]} detailed identical to ${ids[j]}`);
    }
  }
}

if (problems.length) {
  console.log('FAIL email matrix:');
  problems.forEach(p => console.log(' -', p));
  process.exit(1);
}
console.log('OK: test_email_matrix passed — 按钮切档有效，正文非套话');
