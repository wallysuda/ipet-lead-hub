# IPET Lead Hub 完整优化方案

> 范围：安全止血、数据可靠、研判与邮件质量、产品体验与录入效率  
> 基线：`~/ipet-lead-hub`（部署于 Vercel，线上 9 条真实线索）  
> 原则：先止血再增强；不改业务语义（仍是线索资产库 + Jev 研判 + 英文跟进邮件）；可验收、可回滚。

---

## 0. 现状架构（改造基线）

```
线索入口（粘贴 / CSV / WordPress Webhook）
        │
        ▼
  normalizer.js ──► 结构化字段 + 技术参数（MTOW/电压/推力…）
        │
        ▼
  jev_engine.js ──► Tier 分级 + 成熟度评分（优先 /api/jev，失败本地校准）
        │
        ├──────────────► inquiry_responder.js ──► 纯英文跟进邮件
        ▼
  sync_service.js（localStorage + 查重 + 合并）
        │
        ▼
  api/sync.js ──► GitHub data/cloud_leads.json（Contents API 当库）
  api/jev.js  ──► TypeSafe System One
  api/ingest.js ──► Webhook 入库
```

| 模块 | 职责 | 行数 |
|------|------|------|
| `js/app.js` | UI、表格、邮件弹层、CSV/粘贴 | 764 |
| `js/normalizer.js` | 自由文本/CSV/键值对归一化 | 673 |
| `js/jev_engine.js` | 意图分级与打分 | 362 |
| `js/inquiry_responder.js` | 策略切角 + 英文邮件 | 1166 |
| `js/sync_service.js` | 本地/云同步与查重 | 397 |
| `api/sync.js` | 线索持久化 | 281 |
| `api/jev.js` | TypeSafe 代理 | 281 |
| `api/ingest.js` | Webhook 入库 | 103 |

---

## 1. 问题清单（按严重度）

### P0 · 安全（必须先做）

| ID | 问题 | 位置 | 影响 |
|----|------|------|------|
| S1 | **TypeSafe API key 硬编码在前端** | `js/jev_engine.js:11` | 任何人可提取 key，盗刷模型额度 |
| S2 | **同一 key 硬编码在服务端默认值** | `api/jev.js:15` | 泄露面扩大；注释与实现矛盾 |
| S3 | `/api/jev` 无鉴权、无限流 | `api/jev.js` | 匿名可无限调用 LLM |
| S4 | `/api/sync` GET/POST/DELETE 全开放 + `CORS: *` | `api/sync.js` | 客户 PII（邮箱/电话/需求）可被任意读、改、删 |
| S5 | `/api/ingest` 无来源校验 | `api/ingest.js` | 可伪造 Webhook 灌垃圾线索 |

### P1 · 数据可靠

| ID | 问题 | 位置 | 影响 |
|----|------|------|------|
| D1 | GitHub JSON 文件当主库 | `api/sync.js` | 并发写冲突、无事务、体积上限、历史污染 git |
| D2 | 写失败仍返回 `success: true` | `commitLeadsToGitHub` | 前端以为入库成功，实际丢数据 |
| D3 | Serverless 文件系统只读，本地写多半无效 | `commitLeadsToGitHub` 降级分支 | 静默丢写 |
| D4 | 内存缓存跨实例不一致 | `memoryCache` | 多函数实例读到旧数据 |
| D5 | 前端合并策略仅 `updated_at` 比较 | `sync_service.js` | 无删除墓碑，云端删了本地会复活 |
| D6 | 查重规则偏窄 | `checkDuplicate` | 同人不同邮箱/公司别名会重复入库 |

### P2 · 研判与邮件质量

| ID | 问题 | 位置 | 影响 |
|----|------|------|------|
| J1 | 研判靠关键词硬编码 | `jev_engine.js` `_calibrated*` | 同义表达漏判、分数僵化 |
| J2 | 无置信度校准与人工覆写记录 | — | 无法沉淀「研判对错」 |
| J3 | 邮件策略写死公司域名 | `inquiry_responder.js` gremsy/matzka/baaco… | 换客户即失效 |
| J4 | 主题行/正文无版本与 A/B 记录 | — | 无法比较打开率 |
| J5 | 「100% 纯英文」靠约定，无自动校验 | — | 偶发中文泄漏到外发邮件 |

### P3 · 产品体验与录入效率

| ID | 问题 | 影响 |
|----|------|------|
| U1 | 表格无筛选/排序/搜索 | 线索多了以后不可用 |
| U2 | 无批量操作（打标、导出、重研判） | 逐条点，效率低 |
| U3 | 粘贴解析失败时反馈弱 | 用户不知道哪里没识别 |
| U4 | 无字段级编辑 | 录错只能重录 |
| U5 | 无导出（CSV/Excel）与打印视图 | 无法交接给销售/ERP |
| U6 | 统计区偏展示，缺转化漏斗 | 看不出渠道质量 |

---

## 2. 改造路径（分四期）

### Phase A · 安全止血（当天可完成）

**目标：密钥不再出现在前端；API 不可被匿名滥用。**

1. **密钥治理**
   - 删除 `js/jev_engine.js` 与 `api/jev.js` 中的 `DEFAULT_TYPESAFE_API_KEY`。
   - 仅允许 `process.env.TYPESAFE_API_KEY`（Vercel Environment Variables）。
   - 前端 `setApiKey` 仅保留「调试用 localStorage 覆写」，默认不注入任何 key。
   - **人工步骤（需你操作）**：到 TypeSafe 控制台 **轮换/作废** 当前已泄露的 key，再写入 Vercel env。
2. **`/api/jev` 防护**
   - 要求 `Authorization: Bearer <HUB_API_TOKEN>` 或同站 `Origin` 校验 + 简单限流（同 IP 每分钟 N 次）。
   - GET 健康检查可保留，但不再回显 `api_key_configured` 细节以外的信息。
3. **`/api/sync` 鉴权**
   - GET 读线索：需要 token（或改为只返回脱敏摘要）。
   - POST/DELETE：必须 `HUB_WRITE_TOKEN`。
   - 收紧 CORS：仅允许部署域名 + 本地开发 origin。
4. **`/api/ingest`**
   - 校验 `X-Hub-Secret`（WordPress Webhook 带上）或 HMAC 签名。

**验收**
- [ ] 线上 `js/jev_engine.js` 响应体中搜不到 `apikey_`
- [ ] 无 token 调用 `POST /api/jev` / `POST /api/sync` 返回 401
- [ ] 浏览器从其它域名写入被 CORS 拒绝
- [ ] 前端正常功能（研判、同步、邮件）在登录 token 下工作

### Phase B · 数据可靠

**目标：写入不丢、并发安全、可审计。**

1. **主库迁移（推荐顺序）**
   - 首选 **Vercel KV / Upstash Redis** 或 **Supabase Table**（线索表 + 版本号 + `deleted_at` 墓碑）。
   - 次选：GitHub 改为 **单行 append-only NDJSON + 定期压实**（降低冲突），仅作过渡。
   - 本地开发：内存/JSON 文件实现同一 `LeadStore` 接口。
2. **抽象 `LeadStore` 接口**
   ```js
   list() / get(id) / upsert(lead) / softDelete(id) / replaceAll(leads)
   ```
   `api/sync.js` 只依赖接口，不再直接 `fs` + GitHub API。
3. **写入语义**
   - `upsert` 返回真实结果；失败 HTTP 5xx，禁止假成功。
   - 带 `sync_version` 乐观锁；冲突返回 409 + 最新记录。
   - 删除用墓碑，前端合并时丢弃已删 id。
4. **同步加固**
   - 前端：指数退避重试、失败队列、同步状态可点击重试。
   - 查重增强：邮箱域名别名、公司名归一（Inc/Ltd/Co 去后缀）、手机号 E.164。

**验收**
- [ ] 并发 2 个 POST 不丢记录
- [ ] 网络失败时前端显示「未同步」且重试后成功
- [ ] 删除的线索不会在另一设备复活
- [ ] `success: false` 与真实状态一致

### Phase C · 研判与邮件质量

**目标：分级更稳、邮件更像专业工程跟进、可度量。**

1. **研判**
   - 保留双轨：`jev_live` + 本地校准兜底，但校准器改为 **加权特征打分**（参数完整度、决策链角色、渠道、动词强度），输出连续 `maturity_score` 而非固定 4.8/3.5/2.2。
   - 增加 `judgments` 日志表：输入摘要、输出、人工覆写、是否被销售采纳。
   - 批量「重新研判」支持 **仅重判 score 变化大的**，省 token。
2. **邮件**
   - 把 gremsy/matzka/baaco 等改为 **策略配置表**（`data/channel_templates.json` 扩展）：匹配条件 → 策略 id，禁止硬编码公司名。
   - 每个策略产出：`subject_candidates[]`、`body`、`cta`、`tone`。
   - 外发前自动校验：`/[\u4e00-\u9fff]/` 零命中；主题 35–50 字符；含签名块。
   - 邮件结果回写：`email_generated_at`、`strategy_id`、`subject_used`，便于后续看哪个切角有效。

**验收**
- [ ] 单元测试覆盖：重载 RFQ / 白皮书 / 供应商推销 / 宠物误点 / 学术 五类
- [ ] 任意生成邮件中文字符数为 0
- [ ] 配置表可新增一家目标客户而无需改 JS
- [ ] 重新研判可只刷新变化项

### Phase D · 产品体验与录入效率

**目标：线索上百条后仍然好用。**

1. **表格**
   - 搜索（姓名/公司/邮箱/需求全文）
   - 筛选：Tier、渠道、时间范围、是否已跟进
   - 排序：时间、成熟度、公司
   - 列显示偏好记忆（localStorage）
2. **批量**
   - 多选 → 批量导出 CSV、批量重研判、批量标记已跟进
3. **录入**
   - 粘贴后「解析预览」：识别到的字段高亮 + 未识别片段，可手动补
   - 字段级行内编辑（公司、职位、电话、需求）
4. **导出与交接**
   - 导出 CSV（含 Tier、评分、策略、邮件主题）
   - 简单漏斗：渠道 → Tier1/2 → 已发邮件 → 已回复
5. **可访问性与性能**
   - 大列表虚拟滚动（>200 条时）
   - 关键操作快捷键（`/` 搜索、`n` 新建、`e` 邮件）

**验收**
- [ ] 100 条样例数据下筛选/搜索 < 100ms 体感
- [ ] 批量导出可直接用 Excel 打开
- [ ] 粘贴错误文本时明确指出问题，不静默丢字段

---

## 3. 实施顺序与依赖

```
Phase A（安全） ──► Phase B（存储）
                      │
                      ├─► Phase C（研判/邮件）  // 依赖稳定读写与配置表
                      └─► Phase D（体验）       // 依赖稳定数据与筛选字段
```

| 期 | 预估改动 | 需要你提供 |
|----|----------|------------|
| A | 改 4 个文件 + Vercel env | **轮换 TypeSafe key**；设置 `HUB_API_TOKEN` / `HUB_WRITE_TOKEN` |
| B | 新增 `LeadStore` + 迁移 | 选定 KV/Supabase（或继续 GitHub 的确认） |
| C | 研判 + 模板 + 测试 | 有效客户/策略样例（可选） |
| D | `app.js` / `style.css` | 无 |

---

## 4. 明确不做（本轮边界）

- 不做完整 CRM（商机阶段机、邮件收发、日历）
- 不做多租户/多用户权限体系（仅共享 token）
- 不重写为 React/Vue（保持静态 + Serverless，降低迁移风险）
- 不在方案里引入付费 SaaS 依赖（除非你指定存储产品）

---

## 5. 回滚策略

- 每期独立分支/提交，可 `git revert` 单期。
- Phase B 切换存储时保留「只读旧 GitHub JSON 导入」脚本，迁移失败可切回。
- 密钥与 token 只进 Vercel Environment Variables，仓库内永远不出现明文。

---

## 6. 建议的立即行动（本周）

1. **你**：轮换 TypeSafe API key（当前 key 已公开，必须视为已泄露）。
2. **我**：完成 Phase A 代码（去硬编码、鉴权、限流、CORS 收紧）。
3. **你**：在 Vercel 配置 `TYPESAFE_API_KEY`、`HUB_API_TOKEN`、`HUB_WRITE_TOKEN`。
4. **我**：跑通本地测试后进入 Phase B/C/D。

---

## 7. 实施进度（已落地）

| 期 | 状态 | 说明 |
|----|------|------|
| A 安全 | 已完成 | 密钥移出源码、鉴权/限流/CORS、fail-closed、前端令牌栏 |
| B 数据 | 大部分完成 | LeadStore 抽象、乐观锁 `sync_version`、软删除墓碑、查重增强、假成功修复。**真数据库迁移待选型** |
| C 研判/邮件 | 已完成 | 加权特征打分、增量重研判、账号路由配置化、外发纯英文校验、策略/主题回写 |
| D 体验 | 已完成 | 搜索/筛选/排序/CSV、批量重研判/标记/软删/导出、双击行内编辑、漏斗统计 |

### 测试
```
npm test   # security + lead_store + normalizer + inquiry
```

### 待你操作
1. TypeSafe 控制台**作废旧 key**，写入 Vercel `TYPESAFE_API_KEY`
2. 配置 `HUB_API_TOKEN` / `HUB_WEBHOOK_SECRET` / `HUB_ALLOWED_ORIGINS`
3. 重新部署；WordPress Webhook 加 `X-Hub-Secret`
4. （可选）选定 KV/Supabase 后设 `LEAD_STORE` 并扩展 lead_store 驱动
