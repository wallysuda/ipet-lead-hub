/**
 * IPET LEAD ASSETS HUB · 自动化单元测试套件
 * 运行方式: node tests/test_normalizer.js
 */

const assert = require('assert');
const Normalizer = require('../js/normalizer.js');
const { InquiryResponder } = require('../js/inquiry_responder.js');
const JevEngine = require('../js/jev_engine.js');

async function runTests() {
  console.log('🧪 Starting IPET Lead Assets Hub Test Suite...\n');

  // ==========================================
  // 测试 1: 非结构化文本与邮件解析
  // ==========================================
  console.log('1. Testing Unstructured Free-Text Parser...');
  const sampleEmailText = `
From: David Miller <david.miller@aerosystems-defense.com>
Subject: Heavy-Lift VTOL Propulsion RFQ
Message:
Hi IPET Sales Team,
We are currently developing a 45kg MTOW hybrid VTOL UAV for defense inspection.
We require a 14S LiPo propulsion system with at least 15kg hover thrust per arm.
Could you send pricing and 3D STEP files for 8 sets of motors and matching ESCs?
Company: AeroSystems Defense Inc
Phone: +1 (555) 234-5678
Location: Dallas, TX, USA
`;

  const parsedFromText = Normalizer.parseFreeText(sampleEmailText, { channel: 'Direct Email' });
  assert.strictEqual(parsedFromText.email, 'david.miller@aerosystems-defense.com');
  assert.ok(parsedFromText.name.includes('David Miller'));
  assert.strictEqual(parsedFromText.technical_parameters.mtow, '45kg');
  assert.ok(parsedFromText.technical_parameters.uav_type.includes('VTOL'));
  assert.strictEqual(parsedFromText.company, 'AeroSystems Defense Inc');
  console.log('  ✅ Free-text NLP extraction passed!\n');

  // ==========================================
  // 测试 2: 多语言/非标准表单动态归一化 (中文字段 + 杂乱表单)
  // ==========================================
  console.log('2. Testing Multi-Channel Schema Normalization (Chinese & Non-standard keys)...');
  const sampleChineseForm = {
    "客户姓名": "张工",
    "企业名称": "极翼工业级无人机科技有限公司",
    "电子邮箱": "zhang@jiyi-uav.cn",
    "联系手机": "+86 13800138000",
    "意向机型": "共轴八旋翼 X8",
    "最大起飞重量 (MTOW)": "65kg",
    "动力工作母线电压": "18S 75V",
    "单轴推力指标": "8.5kg 额定悬停推力",
    "研发阶段": "Flight Testing 试飞测试中",
    "采购预算或批次": "首批 12 套样机测试",
    "备忘说明": "急需匹配高压 FOC 电调与 34 寸碳纤维螺旋桨，要求低震动与 DroneCAN 遥测"
  };

  const normalizedChinese = Normalizer.normalize(sampleChineseForm, { channel: '官网中英双语询盘表单' });
  assert.strictEqual(normalizedChinese.name, '张工');
  assert.strictEqual(normalizedChinese.company, '极翼工业级无人机科技有限公司');
  assert.strictEqual(normalizedChinese.email, 'zhang@jiyi-uav.cn');
  assert.strictEqual(normalizedChinese.phone, '+86 13800138000');
  assert.strictEqual(normalizedChinese.technical_parameters.mtow, '65kg');
  assert.ok(normalizedChinese.technical_parameters.voltage.includes('18S'));
  assert.ok(normalizedChinese.technical_parameters.uav_type.includes('Coaxial X8') || normalizedChinese.technical_parameters.uav_type.includes('共轴'));
  assert.ok(normalizedChinese.technical_parameters.stage.includes('Flight Testing') || normalizedChinese.technical_parameters.stage.includes('试飞'));
  // 确认保留了未完全映射的备忘字段
  assert.ok(normalizedChinese.fields_filled['备忘说明']);
  console.log('  ✅ Schema normalization with Chinese fields passed!\n');

  // ==========================================
  // 测试 3: CSV 批量数据解析
  // ==========================================
  console.log('3. Testing Universal CSV Parser...');
  const csvData = `Full Name,Work Email,Organization,Country,Aircraft MTOW,Bus Voltage,Stage,Requirements
Robert Johnson,r.johnson@heavyflight.co.uk,HeavyFlight Ltd,United Kingdom,32kg,12S,Prototype,Need dyno curves for 30 inch propellers
Sarah Connor,s.connor@skyfleet.de,SkyFleet Systems,Germany,16kg,12S,Concept,Looking for I7 sample CAD`;

  const parsedCsv = Normalizer.parseCSV(csvData, { channel: 'LinkedIn CSV Export' });
  assert.strictEqual(parsedCsv.length, 2);
  assert.strictEqual(parsedCsv[0].name, 'Robert Johnson');
  assert.strictEqual(parsedCsv[0].email, 'r.johnson@heavyflight.co.uk');
  assert.strictEqual(parsedCsv[0].technical_parameters.mtow, '32kg');
  assert.strictEqual(parsedCsv[1].name, 'Sarah Connor');
  assert.strictEqual(parsedCsv[1].technical_parameters.mtow, '16kg');
  console.log('  ✅ CSV parsing and automated column mapping passed!\n');

  // ==========================================
  // 测试 4: Jev 强类型研判引擎与防宠物红线防线
  // ==========================================
  console.log('4. Testing JevEngine Intent Tiering & Pet Safeguards...');
  const jev = new JevEngine();

  // 测试宠物误触样本
  const petInquiry = "Looking for dog tracker collar and cute pet toys wholesale";
  const petRes = await jev.scoreLeadIntent(petInquiry, "buyer@petsupplies.com", "Pet World");
  assert.strictEqual(petRes.tier, 'DISQUALIFIED');
  assert.strictEqual(petRes.has_pet_confusion, true);

  // 测试重载工业级真实 RFQ
  const rfqInquiry = "Need 50kg MTOW powertrain, thrust bench dyno test curves and 3D step CAD for multirotor";
  const rfqRes = await jev.scoreLeadIntent(rfqInquiry, "engineer@gremsy.com", "Gremsy");
  assert.strictEqual(rfqRes.tier, 'TIER_1_READY_RFQ');
  assert.strictEqual(rfqRes.has_pet_confusion, false);
  console.log('  ✅ JevEngine intent scoring & anti-pet filters passed!\n');

  // ==========================================
  // 测试 5: InquiryResponder 纯正英文保证 (零中文字符校验)
  // ==========================================
  console.log('5. Testing InquiryResponder Zero-Chinese Email Generation Guarantee...');
  
  // 即使输入全部为中文的线索
  const analysisChinese = InquiryResponder.analyzeLead(normalizedChinese);
  assert.strictEqual(analysisChinese.persona, 'TYPE_B_COMMERCIAL_OEM');
  const strategies = InquiryResponder.getStrategies(analysisChinese);
  assert.ok(strategies.length >= 2);

  // 为每个策略生成邮件并测试纯正英文性
  for (const strat of strategies) {
    const subjects = InquiryResponder.generateSubjectLinesForStrategy(analysisChinese, strat.id);
    assert.ok(subjects.length > 0);
    const chosenSubj = subjects[0].text;
    
    // 校验主题行长度在 35~50 字符内
    assert.ok(chosenSubj.length >= 35 && chosenSubj.length <= 50, `Subject line length ${chosenSubj.length} outside [35, 50] range: "${chosenSubj}"`);
    
    // 生成邮件正文
    const emailBody = InquiryResponder.generateCustomEmailBody(analysisChinese, strat.id, chosenSubj);
    
    // 严厉检测：正文与主题行中不得含有任何汉字！
    const chineseRegex = /[\u4e00-\u9fa5]/;
    assert.strictEqual(chineseRegex.test(chosenSubj), false, `Chinese detected in subject: ${chosenSubj}`);
    assert.strictEqual(chineseRegex.test(emailBody), false, `Chinese detected in email body for strategy ${strat.id}!`);
  }
  console.log('  ✅ 100% Pure English Guarantee with 0 Chinese characters verified!\n');

  // 测试供应商画像路由
  const supplierLead = {
    name: "Alex Vance",
    email: "alex@firstlevelinc.com",
    company: "First Level Microelectronics",
    requirements: "We are a packaging supplier specializing in wire bonding and microelectronics assembly",
    raw_text: "Packaging supplier wire bonding for power electronics"
  };
  const analysisSupplier = InquiryResponder.analyzeLead(supplierLead);
  assert.strictEqual(analysisSupplier.persona, 'TYPE_S_SUPPLIER');
  const supplierStrat = InquiryResponder.getStrategies(analysisSupplier);
  assert.strictEqual(supplierStrat[0].id, 'supplier_intake');
  const supplierBody = InquiryResponder.generateCustomEmailBody(analysisSupplier, 'supplier_intake', 'Supplier Intake');
  assert.ok(supplierBody.includes('line card'));
  assert.ok(!supplierBody.includes('MTOW')); // 绝不向供应商索取无人机 MTOW
  console.log('  ✅ Supplier persona isolation & Line Card routing verified!\n');

  // 测试宠物误触画像路由
  const petLead = {
    name: "Puppy Store",
    email: "info@dogtoys.com",
    company: "Dog Toys Co",
    requirements: "Do you have pet collars?",
    jev_analysis: { tier: 'DISQUALIFIED', has_pet_confusion: true }
  };
  const analysisPet = InquiryResponder.analyzeLead(petLead);
  assert.strictEqual(analysisPet.persona, 'TYPE_D_DISQUALIFIED');
  const petBody = InquiryResponder.generateCustomEmailBody(analysisPet, 'disqualify_polite', 'Inquiry regarding IPET');
  assert.ok(petBody.includes('do not produce consumer gadgets, pet products'));
  assert.ok(!petBody.includes('MTOW'));
  console.log('  ✅ Disqualified persona boundary clarification verified!\n');

  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! The core engine is bulletproof.');
}

runTests().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
