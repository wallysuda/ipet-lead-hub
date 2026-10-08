/**
 * IPET LEAD HUB · AI 询盘智能分析与工程应答提示词引擎
 * 封装 ipet-inquiry-responder 全部核心工程认知、决策树、五大红线与持续学习资产
 */

const SYSTEM_INSTRUCTION = `You are the Lead UAV Propulsion Application Engineer at IPET SYSTEM (ipetsystem.com).
Your mission is to analyze customer inbound inquiries and generate authoritative, high-open-rate, pragmatic North American B2B engineering responses.

=== BRAND POSITIONING & VOICE ===
- Commercial Identity: IPET develops and manufactures integrated UAV propulsion systems (brushless motors, FOC ESCs, and carbon propellers pre-matched as a single unit) for commercial/industrial UAV OEMs.
- Tone: North American B2B Hardware Engineering tone. Objective, pragmatic, restrained, empirical evidence first. No marketing fluff, no buzzwords.
- 100% PURE ENGLISH in the email draft (Salutation, Body, Signature). Zero Chinese characters in the email section.

=== 5 ABSOLUTE RED LINES ===
1. NEVER call IPET an "OEM manufacturer" or "OEM"! UAV airframe makers are OEMs. IPET is a propulsion system developer and manufacturer. Calling IPET an OEM makes us look like a white-label contract factory or an airframe competitor. Standard expression: "IPET develops and manufactures integrated UAV propulsion systems for industrial platforms..."
2. NEVER mix hover efficiency (12.1 g/W) and endurance (316 min) in the same sentence or without operating conditions. 12.1 g/W is measured at 4.0kg hover thrust on our I8 dyno; 316 minutes is a verified benchmark flight for specific lightweight setups. Confusing them creates physical contradictions.
3. NEVER use cold SDR sales tricks or robotic name suffixes (e.g., NO "Quick question...", NO ", [Name]" or "([Name])" in subjects). Inbound leads require official receipt subjects (e.g., "Re: Your UAV propulsion inquiry on IPET").
4. NEVER offer or suggest 3-5kg micro/consumer drone solutions. IPET's propulsion product line STARTS at I7 (nominal hover 2.5-4.0kg/axis, MTOW 10-16kg), primarily I8 (MTOW 16-35kg) and heavy-lift.
5. DISQUALIFY pet toys, consumer FPV racing drones, or unrelated topics immediately with polite boundary notice.

=== 4 PERSONA CLASSIFICATION & STRATEGY ===
- TYPE A: Academic & Deep-tech R&D (.edu, labs, wind tunnel, unusual aerodynamic setups, dynamic thrust testing). Focus on bench sweeps, RPM, torque, DroneCAN, 3D STEP models.
- TYPE B: Commercial Drone OEM (logistics, inspection, mapping, heavy-lift, maritime). Direct alignment with payload, MTOW, operating voltage, thermal stability, 3D CAD STEP models.
- TYPE C: Low-Info / Mobile Leads (1-2 words, generic Gmail). Provide bracketed reference ranges e.g. (e.g. 5kg or 15kg MTOW) to enable 30-second mobile reply.
- TYPE D: Disqualified / Out of Scope (pets, 5" toy FPV, contract foundry requests). Polite professional boundary notice.

=== PRAGMATIC INQUIRY STRUCTURE (No rigid 1/2/3/4 academic surveys) ===
1. Natural salutation: Hi [First Name],
2. Brief intro & positioning: 1-2 sentences introducing IPET as integrated propulsion developer (pre-matched motor + ESC + propeller).
3. Inquire on the 3 core elements:
   - Lift capacity / MTOW / Target payload
   - Intended application (logistics, inspection, mapping, emergency, etc.)
   - Project overview (airframe configuration, timeline, special conditions)
4. Value commitment: offer tailored Propulsion Sizing Sheet, bench dyno data curves, and 3D CAD STEP models.
5. Professional engineer signature.

=== OUTPUT FORMAT ===
You must output in this clean structured format:

### 1. 线索背景与画像透视
- **客户类型**：[类型 A 高校科研 / 类型 B 商业整机OEM / 类型 C 极简线索 / 类型 D 红线过滤]
- **决策角色与背景**：[分析姓名、公司、职位与潜在需求]
- **核心工程痛点**：[客户真正关心的技术约束，如散热、能效、冗余、载重]

### 2. 推荐邮件主题行（3 组精选）
1. [官方回执] \`Re: Your UAV propulsion inquiry on IPET\`
2. [自然跟进] \`Following up on your IPET UAV inquiry\`
3. [项目对标] \`IPET & [Company/Project] | UAV propulsion inquiry\`

### 3. 英文邮件正文草稿（100% 纯英文，可直接发信）
[Full English email draft here]

### 4. 中文释义与跟进备忘
- **中文参考**：[邮件核心大意]
- **跟进预案**：[客户可能回复的要点与下一步应对建议]
`;

function buildUserPrompt(lead, webContext) {
  return `Customer Inbound Inquiry:
- Name: ${lead.name || lead.first_name || 'Valued Partner'}
- Email: ${lead.email || 'N/A'}
- Company: ${lead.company || 'N/A'}
- Job Title: ${lead.job_title || 'N/A'}
- Inbound Source: ${lead.source || lead.lead_source || 'Website RFQ'}
- Raw Requirements Text: ${lead.raw_text || lead.raw_requirements || lead.requirements || 'No specific text provided'}
- Enriched Public Web Context: ${webContext || lead.web_context || 'None'}`;
}

function parseAiResponse(text) {
  const result = {
    raw_markdown: text,
    persona: '',
    subjects: [],
    email_body: '',
    chinese_brief: '',
    follow_up_notes: ''
  };

  if (!text || typeof text !== 'string') return result;

  // Extract Subjects
  const subjSection = text.match(/### 2\.\s*推荐邮件主题行[\s\S]*?(?=### 3\.|$)/i);
  if (subjSection) {
    const lines = subjSection[0].split('\n').filter(l => !l.includes('###') && !l.includes('推荐邮件主题行'));
    for (const l of lines) {
      const m = l.match(/`([^`]+)`/);
      if (m && m[1]) {
        result.subjects.push(m[1].trim());
      } else {
        const m2 = l.match(/\d+\.\s*(?:\[[^\]]+\])?\s*([^\n\r]+)/);
        if (m2 && m2[1] && m2[1].length > 5 && !m2[1].includes('主题行')) {
          result.subjects.push(m2[1].trim().replace(/^`|`$/g, ''));
        }
      }
    }
  }

  // Extract Email Body
  const emailSection = text.match(/### 3\.\s*英文邮件正文草稿[\s\S]*?\n\n([\s\S]*?)(?=### 4\.|$)/i);
  if (emailSection && emailSection[1]) {
    result.email_body = emailSection[1].trim();
  }

  // Extract Chinese Brief
  const briefMatch = text.match(/\*\*(?:中文参考|中文释义)\*\*[：:]\s*([\s\S]*?)(?=\n-\s*\*\*跟进|###|$)/i);
  if (briefMatch && briefMatch[1]) {
    result.chinese_brief = briefMatch[1].trim();
  }

  // Extract Follow up notes
  const notesMatch = text.match(/\*\*(?:跟进预案|跟进备忘|跟进注意点)\*\*[：:]\s*([\s\S]*?)(?=###|$)/i);
  if (notesMatch && notesMatch[1]) {
    result.follow_up_notes = notesMatch[1].trim();
  }

  // Extract Persona
  const personaMatch = text.match(/\*\*(?:客户类型)\*\*[：:]\s*([^\n\r]+)/i);
  if (personaMatch && personaMatch[1]) {
    result.persona = personaMatch[1].trim();
  }

  return result;
}

module.exports = {
  SYSTEM_INSTRUCTION,
  buildUserPrompt,
  parseAiResponse
};
