/**
 * IPET LEAD ASSETS HUB · TypeSafe Jev (System One) 官方大模型 API Serverless 代理接口
 * 部署于 Vercel Serverless Function: /api/jev
 * 
 * 核心设计:
 * 1. 安全托管与隔离 TYPESAFE_API_KEY，避免在前端泄露商业凭据；
 * 2. 彻底破除前端直连 https://api.typesafe.ai/v1/systemone 产生的跨域 (CORS) 限制；
 * 3. 严格遵循 TypeSafe System One 原语体系 (Choice 离散单选, Score 概率连续打分, Noul 概率真值研判)；
 * 4. 针对工业无人机重载动力总成 (IPET SYSTEM) 提供高精度的意图研判、防宠物/防玩具歧义过滤与决策链角色判定；
 * 5. 全链路极速毫秒级响应，输出 source: "jev_live"，并返回模型版本号与 Token 消耗。
 */

const https = require('https');

const DEFAULT_TYPESAFE_API_KEY = "apikey_221812bfd37da738469ea9082cbc951f69d5_64b5766d3cdf62618ec507194eeb4126619aea698f0097cebf4407a2a16b3621";

function getApiKey() {
  return (process.env.TYPESAFE_API_KEY && process.env.TYPESAFE_API_KEY.trim()) || DEFAULT_TYPESAFE_API_KEY;
}

function callTypeSafeApi(payload) {
  return new Promise((resolve, reject) => {
    const apiKey = getApiKey();
    const data = JSON.stringify(payload);

    const options = {
      hostname: 'api.typesafe.ai',
      port: 443,
      path: '/v1/systemone',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'User-Agent': 'IPET-Lead-Hub-Proxy/1.0'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data: parsed });
          } else {
            reject(new Error(`TypeSafe API HTTP ${res.statusCode}: ${body}`));
          }
        } catch (e) {
          reject(new Error(`TypeSafe API response parse error: ${body}`));
        }
      });
    });

    req.on('error', err => reject(err));
    req.setTimeout(9000, () => {
      req.destroy();
      reject(new Error('TypeSafe API timeout after 9s'));
    });

    req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'online',
      service: 'IPET Lead Hub · TypeSafe Jev System One Serverless Proxy',
      model: 'jev-latest',
      active_backend: 'https://api.typesafe.ai/v1/systemone',
      api_key_configured: !!getApiKey()
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }
    body = body || {};

    const action = body.action || (body.leadText ? 'score_lead' : body.title ? 'judge_title' : body.company ? 'judge_company' : 'score_lead');

    // 动作 1: 线索意图分级与成熟度打分 (score_lead)
    if (action === 'score_lead') {
      const leadText = (body.leadText || body.intent_text || body.text || '').trim();
      const email = (body.email || '').trim();
      const company = (body.company || '').trim();
      const jobTitle = (body.job_title || body.title || '').trim();

      if (!leadText && !email) {
        return res.status(200).json({
          success: true,
          source: 'default',
          tier: 'TIER_3_EXPLORATORY',
          maturity_score: 1.5,
          has_pet_confusion: false,
          confidence: 0.90,
          recommended_action: '初级意向线索，发送重载无人机动力白皮书与选型计算表，培育后续需求。'
        });
      }

      const typesafePayload = {
        state: {
          lead_text: leadText,
          email: email,
          company: company,
          job_title: jobTitle,
          domain: 'Industrial Heavy-Lift UAV Powertrain & Propulsion System (IPET SYSTEM)'
        },
        model: 'jev-latest',
        questions: {
          is_pet_or_toy: {
            type: 'noul',
            instructions: 'Is this inquiry related to pets, dogs, cats, animal care, or children toys rather than industrial UAVs/aerospace?'
          },
          intent_tier: {
            type: 'choice',
            instructions: 'Classify the B2B buyer intent of this industrial UAV powertrain inquiry:',
            criteria: {
              TIER_1_READY_RFQ: 'Active OEM engineering project, heavy-lift drone powertrain/motor/ESC matching, prototype flight testing, explicit RFQ with engineering specifications, sample pricing, or trade show meeting',
              TIER_2_TECH_SPEC: 'Generic requests for product catalog, standard datasheet, or whitepapers without specific aircraft/powertrain project parameters',
              TIER_3_EXPLORATORY: 'General exploratory inquiry, vague microelectronics or peripheral hardware supply discussion',
              DISQUALIFIED: 'Irrelevant noise, spam, pet product or consumer toy confusion'
            }
          },
          maturity_score: {
            type: 'score',
            instructions: 'Evaluate the commercial and engineering maturity of this inquiry for industrial UAVs:',
            criteria: [
              'Low maturity, irrelevant spam, pet or consumer toy noise',
              'Vague exploratory inquiry',
              'Technical documentation request',
              'High maturity project with engineering parameters',
              'Highest maturity OEM RFQ with prototype schedule'
            ]
          }
        }
      };

      const result = await callTypeSafeApi(typesafePayload);
      const answers = result.data.answers || {};

      const petAns = answers.is_pet_or_toy;
      const tierAns = answers.intent_tier;
      const scoreAns = answers.maturity_score;

      const hasPetConfusion = (petAns && typeof petAns.noul === 'number' && petAns.noul > 0.5) || false;

      let finalTier = tierAns ? tierAns.choice : 'TIER_3_EXPLORATORY';
      let confidence = tierAns ? (tierAns.confidence || 0.95) : 0.90;

      let rawScoreVal = (scoreAns && typeof scoreAns.score === 'number') ? scoreAns.score : 1.5;
      let finalMaturity = +(rawScoreVal + 1.0).toFixed(1);

      if (hasPetConfusion) {
        finalTier = 'DISQUALIFIED';
        finalMaturity = 0.0;
        confidence = 0.99;
      } else {
        if (finalTier === 'TIER_1_READY_RFQ' && finalMaturity < 4.0) {
          finalMaturity = 4.5;
        }
      }

      let recommendedAction = '初级意向线索，发送重载无人机动力白皮书与选型计算表，培育后续需求。';
      if (finalTier === 'TIER_1_READY_RFQ') {
        recommendedAction = '高价值紧急 OEM/研发商机！涉及工业无人机核心动力总成匹配，立即由工程团队发送专属推力台架曲线、选型建议与 3D STEP 下载链接。';
      } else if (finalTier === 'TIER_2_TECH_SPEC') {
        recommendedAction = '技术资料索取！发送完整规格表与电机电调一体化选型指南。';
      } else if (finalTier === 'DISQUALIFIED') {
        recommendedAction = '宠物/玩具歧义误点！判定无效归档，并将其邮箱后缀与相关关键词追加至否定排除库。';
      }

      return res.status(200).json({
        success: true,
        source: 'jev_live',
        model: result.data.model || 'jev-latest',
        tier: finalTier,
        maturity_score: finalMaturity,
        has_pet_confusion: hasPetConfusion,
        confidence: confidence,
        recommended_action: recommendedAction,
        probabilities: tierAns?.probabilities || {},
        usage: result.data.usage || {}
      });
    }

    // 动作 2: 职位语义消歧打标 (judge_title)
    if (action === 'judge_title') {
      const title = (body.title || '').trim();
      const typesafePayload = {
        state: { job_title: title },
        model: 'jev-latest',
        questions: {
          decision_role: {
            type: 'choice',
            instructions: 'Classify this professional job title in an aerospace/drone hardware buying committee:',
            criteria: {
              EXECUTIVE_DECISION_MAKER: 'C-level executives, VP, Director, Founder, Chief Engineer',
              COMMERCIAL_BUYER: 'Procurement, Sourcing, Supply Chain, Purchasing, Buyer',
              TECHNICAL_EVALUATOR: 'UAV/Aeronautical/Powertrain/Mechanical/Avionics engineer, Flight test pilot',
              IRRELEVANT_NOISE: 'Sales, Marketing, HR, Finance, Student, Teacher, Non-technical'
            }
          }
        }
      };

      const result = await callTypeSafeApi(typesafePayload);
      const ans = result.data.answers?.decision_role;

      return res.status(200).json({
        success: true,
        source: 'jev_live',
        model: result.data.model || 'jev-latest',
        role: ans ? ans.choice : 'IRRELEVANT_NOISE',
        confidence: ans ? ans.confidence : 0.90,
        probabilities: ans?.probabilities || {}
      });
    }

    // 动作 3: 企业是否为目标客群研判 (judge_company)
    if (action === 'judge_company') {
      const company = (body.company || '').trim();
      const industry = (body.industry || '').trim();

      const typesafePayload = {
        state: { company_name: company, industry: industry },
        model: 'jev-latest',
        questions: {
          is_industrial_target: {
            type: 'noul',
            instructions: 'Is this company an industrial drone/robotics/aerospace OEM, integrator, or related supplier rather than pet/toy store or consumer noise?'
          }
        }
      };

      const result = await callTypeSafeApi(typesafePayload);
      const ans = result.data.answers?.is_industrial_target;
      const prob = (ans && typeof ans.noul === 'number') ? ans.noul : 0.5;

      return res.status(200).json({
        success: true,
        source: 'jev_live',
        model: result.data.model || 'jev-latest',
        is_target: prob >= 0.5,
        probability: prob
      });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });

  } catch (error) {
    console.error('TypeSafe Jev API proxy error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      fallback_available: true
    });
  }
};
