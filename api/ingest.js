/**
 * IPET LEAD ASSETS HUB · 多渠道外部 Webhook 动态入库接口
 * 部署于 Vercel Serverless Function: /api/ingest
 * 
 * 用途:
 * 允许外部官网表单、落地页、Typeform、Zapier、Shopify 或外部系统直接通过 POST 请求接入。
 * 无论外部表单采用何种字段名 (如 `your-email`, `contact_name`, `uav_model`, `留言内容` 等)，
 * 本接口均通过 Smart Schema Normalizer 自动识别对齐并归一化入库。
 */

const Normalizer = require('../js/normalizer.js');
const JevEngine = require('../js/jev_engine.js');
const syncHandler = require('./sync.js');

const jev = new JevEngine();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Channel-Source');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'active',
      service: 'IPET Lead Assets Hub · Universal Ingestion Webhook',
      endpoint: '/api/ingest',
      method: 'POST',
      accepted_content_types: ['application/json', 'application/x-www-form-urlencoded', 'text/plain'],
      description: 'Send any raw lead form JSON or text to automatically normalize, analyze via Jev AI, and persist into IPET Lead Assets Hub.'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    let rawPayload = req.body;
    if (typeof rawPayload === 'string') {
      try {
        rawPayload = JSON.parse(rawPayload);
      } catch (e) {
        // 如果是纯文本形式的询盘邮件或留言
        rawPayload = { text: rawPayload };
      }
    }
    rawPayload = rawPayload || {};

    const channelHint = req.headers['x-channel-source'] || rawPayload.channel_source || rawPayload.channel || '';

    // 1. 智能归一化
    let normalizedLead;
    if (rawPayload.text && Object.keys(rawPayload).length <= 2) {
      normalizedLead = Normalizer.parseFreeText(rawPayload.text, { channel: channelHint || 'Webhook 纯文本' });
    } else {
      normalizedLead = Normalizer.normalize(rawPayload, { channel: channelHint || 'Webhook 接口入库' });
    }

    // 2. 意图研判
    const evalText = normalizedLead.raw_requirements || normalizedLead.raw_text || '';
    const jevRes = await jev.scoreLeadIntent(
      evalText,
      normalizedLead.email,
      normalizedLead.company,
      normalizedLead.job_title
    );
    normalizedLead.jev_analysis = jevRes;

    // 3. 内部委托给 syncHandler 存入云端
    const mockReq = {
      method: 'POST',
      body: normalizedLead,
      headers: req.headers
    };
    const mockRes = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.statusCode = code; return this; },
      json(data) {
        return res.status(201).json({
          success: true,
          message: 'Lead asset successfully normalized and stored',
          lead: normalizedLead,
          storage_result: data
        });
      }
    };

    await syncHandler(mockReq, mockRes);

  } catch (error) {
    console.error('[Ingest API Error]:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
