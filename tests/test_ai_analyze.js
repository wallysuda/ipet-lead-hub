const assert = require('assert');
const { SYSTEM_INSTRUCTION, buildUserPrompt, parseAiResponse } = require('../lib/knowledge/prompt_engine');

console.log('Testing Prompt Engine & 5 Red Lines...');

// 1. Verify 5 red lines are present in system instruction
assert(SYSTEM_INSTRUCTION.includes('NEVER call IPET an "OEM manufacturer"'), 'Must contain OEM red line');
assert(SYSTEM_INSTRUCTION.includes('12.1 g/W'), 'Must contain efficiency red line');
assert(SYSTEM_INSTRUCTION.includes('3-5kg micro/consumer drone solutions'), 'Must contain product line boundary');
assert(SYSTEM_INSTRUCTION.includes('100% PURE ENGLISH'), 'Must enforce pure English');
assert(SYSTEM_INSTRUCTION.includes('TYPE A') && SYSTEM_INSTRUCTION.includes('TYPE B'), 'Must contain 4 personas');

// 2. Test User Prompt Construction
const prompt = buildUserPrompt({
  name: 'Marcus Vance',
  company: 'AeroSurvey Technologies',
  email: 'm.vance@aerosurvey.de',
  raw_text: '22kg MTOW hybrid hexacopter for corridor mapping'
}, 'Live Website: AeroSurvey develops precision airborne sensors');

assert(prompt.includes('Marcus Vance'), 'Prompt must include customer name');
assert(prompt.includes('AeroSurvey Technologies'), 'Prompt must include company');
assert(prompt.includes('22kg MTOW'), 'Prompt must include raw text');
assert(prompt.includes('AeroSurvey develops precision'), 'Prompt must include web context');

// 3. Test AI Response Parsing
const sampleAiMarkdown = `
### 1. 线索背景与画像透视
- **客户类型**：类型 B 商业整机 OEM
- **决策角色与背景**：Marcus Vance 作为首席架构师，负责长航时测绘机型。
- **核心工程痛点**：振动控制与混动电压。

### 2. 推荐邮件主题行（3 组精选）
1. [官方回执] \`Re: Your UAV propulsion inquiry on IPET\`
2. [自然跟进] \`Following up on your IPET UAV inquiry\`
3. [项目对标] \`IPET & AeroSurvey | UAV propulsion inquiry\`

### 3. 英文邮件正文草稿（100% 纯英文，可直接发信）

Hi Marcus,

Thank you for reaching out regarding propulsion for your 22kg MTOW hybrid hexacopter.

IPET develops and manufactures integrated UAV propulsion systems for industrial platforms. For a 22kg MTOW platform, your project aligns with our I8 series architecture.

Could you clarify your bus voltage and target propeller diameter?

Best regards,

Application Engineering Team
IPET SYSTEM

### 4. 中文释义与跟进备忘
- **中文参考**：确认收到需求，推荐 I8 系列并询问总线电压与桨叶尺寸。
- **跟进预案**：客户回复后提供选型表与 3D STEP 模型。
`;

const parsed = parseAiResponse(sampleAiMarkdown);
assert.strictEqual(parsed.persona, '类型 B 商业整机 OEM', 'Persona parsed correctly');
assert.strictEqual(parsed.subjects.length, 3, 'Must parse 3 subjects');
assert.strictEqual(parsed.subjects[0], 'Re: Your UAV propulsion inquiry on IPET', 'First subject correct');
assert(parsed.email_body.includes('Hi Marcus,'), 'Email body must start with salutation');
assert(!/[\u4e00-\u9fa5]/.test(parsed.email_body), 'Email body MUST be pure English (Zero Chinese)');
assert(parsed.chinese_brief.includes('确认收到需求'), 'Chinese brief parsed correctly');
assert(parsed.follow_up_notes.includes('客户回复后提供选型表'), 'Follow-up notes parsed correctly');

console.log('OK: test_ai_analyze passed — 5大红线、解析引擎与零中文隔离核验完毕！');
