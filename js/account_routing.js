/**
 * IPET Lead Hub · 账号/客户路由配置
 * 新增目标客户时只改本文件，不必改 inquiry_responder.js。
 *
 * match: 任一子串命中（不区分大小写，作用于 email / rawText / company）
 * strategy_profile: 后续策略画像
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ACCOUNT_ROUTING = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return {
    accounts: [
      {
        id: 'gremsy',
        match: ['gremsy'],
        company_display: 'Gremsy Joint Stock Company',
        company_short: 'Gremsy',
        industry_profile: '全球知名航测/工业无人机三轴云台与载荷制造商 (Gremsy)',
        flags: { is_gimbal_payload: true }
      },
      {
        id: 'matzka',
        match: ['matzka'],
        company_display: 'Matzka Incorporated',
        company_short: 'Matzka',
        industry_profile: '商业无人机整机研发与商业采购 (OEM Drone Program & Sourcing)',
        flags: {}
      },
      {
        id: 'baaco',
        match: ['baaco', 'baacoaluminum'],
        company_display: 'Baaco Aluminum',
        company_short: 'Baaco Aluminum',
        industry_profile: '工业五金与航空级铝合金构件制造 (Baaco Aluminum)',
        flags: { treat_as_procurement: true }
      },
      {
        id: 'soaring',
        match: ['soaringaero', 'soaring aerospace'],
        company_display: 'Soaring Aerospace',
        company_short: 'Soaring Aerospace',
        industry_profile: '重载多旋翼物流无人机整机研发 (Heavy-Lift Drone Delivery)',
        flags: {}
      },
      {
        id: 'firstlevel',
        match: ['firstlevelinc', 'first level'],
        company_display: null,
        company_short: null,
        industry_profile: '精密微电子封装与引线键合外协供应商 (Microelectronics Packaging)',
        flags: { is_supplier_pitch: true }
      }
    ],
    academic_match: ['.edu', '.ac.', 'university', 'lab'],
    academic_profile: '高校航天与飞行器控制科研团队 (Academic R&D)',
    heavy_cargo_keywords: ['cargo', 'logistics', 'heavy lift', '65kg', '50kg'],
    heavy_cargo_profile: '大载重货运/重载物流无人机 OEM',
    default_industry_profile: '工业无人机整机/系统集成商'
  };
});
