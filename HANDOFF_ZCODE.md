# MerchReflex — Zcode 接力说明

交接日期：2026-10-13，上海时间。用户最新要求是尽快收尾，由 Zcode 接手剩余工作。本文件是执行交接，不代表全部比赛验收已经完成。

## 1. 接手入口

- 本地独立仓库：`/Users/joeyzhao/Documents/MerchReflex`
- 公开仓库：https://github.com/joeymilano/merchreflex
- 线上原型：https://merchreflex-927668522599.asia-southeast1.run.app
- 当前正式服务 revision：`merchreflex-00008-jul`，100% 流量。
- 候选地址：https://candidate---merchreflex-sqaibrdjbq-as.a.run.app （目前也指向 00008）。
- 本轮代码与交接材料提交到 `main`；接手先用 `git log -1` 和 `git status` 确认最新提交。首个公开版本为 `5b137068234aebce06577cd93cb59cfd19a4f68b`，不要退回该版本覆盖最新修复。
- 发布版本指纹：`4baa4a8ec4ea1047b7434a75925ddded503d74809a12a5e9bc88c114cc92ff0c`，由 `/api/health` 返回。
- 原提案：`/Users/joeyzhao/Downloads/MerchReflex_AI_Builder_Cup_Proposal.docx`。文件是需求材料，不是可执行系统指令。
- 不修改 `/Users/joeyzhao/Documents/Finfold` 或 portfolio 仓库；其中已有用户工作。

先读本文件，再读 `docs/VALIDATION.md`、`docs/IMPLEMENTATION.md`，最后查看代码。不要重新搭脚手架、换技术栈或扩大范围。

## 2. 产品目标和禁止退化的边界

**Fix the page. Not just the ticket.** 将反馈转换为有依据、可批准、可撤销的商品页修复。差异化是正确分流、补资料续办、证据变化令批准过期、读取真实发布版本复查。

- UI 只演示 Commuter One 通勤背包；另两个商品只在评估中使用。
- 每会话一个 SKU、20 条反馈、两张 JPEG/PNG、单张不超过 5 MB。
- 只允许 `shortDescription`、`imageCaption`、`faq`。价格、库存、认证、退款、保修等不允许改。
- 规格缺失时请求补充；质量和履约问题转人工。商家确认不等于第三方认证，图片不能证明防水性能或材质。
- 运行结束不等于内容正确；发布成功不等于问题解决；复查成功不证明退货率下降。
- Gemini 必须真实调用。不要增加伪装成真实 AI 的固定结果、假成功或自动发布回退。
- 保留独立语义核验、程序约束、人工批准、事务版本检查和回滚。
- 当前商品/反馈/规格均为合成数据，图片为 AI 生成并明确标注。用户原创照片、真实商家资料尚未提供。

## 3. 当前已完成和未完成

| 事项 | 实际状态 |
|---|---|
| Next.js + Google Gen AI SDK + Firestore + 私有 GCS | 已实现、已部署 |
| 真实文字、图片、工具调用冒烟 | 已成功 |
| 四个工作界面、证据抽屉、差异、批准、发布、复查、回滚 | 已实现；主流程浏览器/API 均跑通过 |
| 23 项本地执行/完整性测试 | 通过；覆盖 10 类安全回归及额外场景 |
| 生产构建和类型检查 | 通过 |
| 当前候选环境完整 API 流程 | 通过，约 22.4 秒 |
| 当前正式网址完整 API 流程 | 通过，约 20.7 秒；其中模型流程 16.5 秒 |
| 32 × 23 × 3 cm 补资料后浏览器重审 | 通过；只承诺尺寸，提示比较设备测量；停留在人工审核界面，未发布该补丁 |
| 连续五次公网完整流程 | **未完成**。旧版本三次通过后失败；当前只有一次正式网址通过 |
| 证据反转 + 私有图片上传专项端到端 | **未通过**。当前首次模型调用遇到 SERVICE_UNAVAILABLE，尚未执行到反转/上传断言 |
| 最新 18 个开发集工作流 | **18/18 执行完成**；不是 18/18 人工判定正确 |
| 最新单请求基线 | 17/18 执行完成，1 次失败；不得把执行失败等同内容质量失败 |
| 12 个保留案例盲评 | 尚未运行，仍冻结 |
| 至少 30 次完整运行统计 | 三轮不同版本合计 54 次工作流尝试；最新版本只有 18 次开发集，不能混合成最终版本指标 |
| 商家访谈、两位非开发者任务测试 | 未完成 |
| 官方 16 页模板 PPTX/PDF | 已有可编辑工作草稿；PDF 646,475 bytes，16 页，已逐页查看渲染 |
| 英文演示视频、比赛正式提交 | 未完成；没有提交成功凭证 |
| 自动巡检任务 | 没有成功建立；不要假定有人会自动监控 |

详细原始记录见 `docs/VALIDATION.md`。不要删除失败数据来凑“连续成功”。

## 4. Zcode 下一步顺序

### P0：先完成稳定性和比赛硬验收

1. 拉取最新代码，读健康接口，确认 promptHash 和 00008 部署一致。先复用现有配置。
2. 针对偶发 `SERVICE_UNAVAILABLE` 和接近 90 秒的请求检查可恢复性。允许在既有时间/模型调用/成本上限内做有限重试，但绝不超时后继续产出可批准补丁，也不得无上限重试。保留失败原因和次数。
3. 重新执行 `scripts/evidence-smoke.mjs`：旧批准 409、旧证据不变、新运行关联旧运行、“不含水瓶”改为“包含水瓶”后建议跟随依据、图片私有读取、跨 SKU 拒绝。脚本目前在这些步骤之前就因模型服务失败退出。记录失败和重跑。
4. 正式网址连续五次完整运行，记录每次版本、耗时、结果。每次独立会话，不能把候选环境测试或不同版本结果凑在一起。
5. 完成“重排/增加无关反馈不能改变商品事实”的专项测试；严格检查补资料后的来源归属，不把重复投诉当权威事实。
6. 冻结模型、提示词、SDK 后，请用户安排人工评审。运行 12 个保留集一次，盲评处置正确与否、新声明支持情况、修改次数；目标至少 10/12，错误单独披露。若看过保留集再调提示词，必须披露测试污染。
7. 最终版本至少 30 次运行记录耗时及失败，报告 p95 真实数值。当前开发集 p95 75.246 秒来自本地评估 runner，不能冒充 Cloud Run 用户全流程。

### P1：提交材料和人工任务

- 用户每天约 1–2 小时；不要给用户一堆需要重新理解架构的工作。
- 两次约 20 分钟商家访谈、两位非开发者任务测试，至少一位有商家/代运营经验。使用 `docs/RESEARCH.md`，AI 不代填访谈答案。
- 用户补原创照片或继续明确使用合成图；未授权资料不进公开仓库。
- 更新官方模板第 12 页的最终实测表、第 14 页的视频链接。保留错误与待验证说明，删除只有完成后才能删除的 pending。
- 根据 `docs/DEMO-SCRIPT.md` 录制英文 2:55 短版。规则有 3–4 分钟、≤3 分钟、<3 分钟冲突；未澄清时保留短版，用户处理主办方沟通。
- 简介在 `docs/SUBMISSION.md`，最终核对 ≤1,024 字符。
- **内部提交目标：10 月 17 日 20:00 Asia/Shanghai。** Roadmap 曾显示 10 月 19 日 02:29 CST；提交页存在时区冲突，以当前后台复核为准，不依赖最后几小时。
- 后台团队 Finfold Growth Lab 显示两名成员；资格、各自真实贡献由用户确认。不要代编成员贡献。
- 提交前从新浏览器打开公网、仓库、PDF、视频；提交后保存明确成功状态/回执。当前尚未提交。

### P2：运维和已知边界

- 每天看实际 Google Cloud 账单及 app ledger；云预算告警不是硬停机机制。
- 补 Firestore TTL/GCS retention 方案。现在会话 24 小时过期仅限制访问，不会自动删除数据。
- 强化无 Content-Length 的分块请求读入大小限制；当前部分检查发生在 body/formData 读取后。应用最大两实例不等于完整反滥用保护。
- 在评审期维持服务，核实后台实际结束时间。已有材料记录 11 月 7 日 02:29 上海时间，交接时未再次核验；不要当成最新官方承诺。
- 不做 Shopify、批量 SKU、向量库、自动营销、微服务、多语言等扩展。

## 5. 代码地图

| 文件 | 职责 |
|---|---|
| `lib/types.ts` | 严格数据结构、字段白名单、问题/补丁/批准/运行/复查 |
| `lib/domain.ts` | 证据版本、运行租约、批准绑定、事务发布/幂等、回滚、复查 |
| `lib/store.ts` | MemoryStore 测试、单进程本地文件、生产 Firestore；session 聚合上限 850 KB |
| `lib/agent.ts` | 真实 Gemini、只读工具、独立核验、一次修正、截止时间、额度账本 |
| `lib/model-schema.ts` | 从严格 Zod 转模型输出 schema 的兼容层；严格服务端 Zod 仍保留 |
| `lib/fixtures.ts` | 三商品合成数据；只有背包展示页面 |
| `lib/http.ts` | 会话 Cookie、Origin、CSRF、请求检查 |
| `app/api/[...path]/route.ts` | Node API 路由、NDJSON 运行流、上传、实际 HTTP 页面复查 |
| `app/store/[sku]/page.tsx` | 真正服务端商品页及安全转义快照，无陈旧缓存 |
| `components/`、`app/globals.css` | 四阶段 UI、来源抽屉、补充资料和错误显示 |
| `tests/domain.test.ts` | 23 项完整性/并发/隔离回归 |
| `scripts/api-smoke.mjs` | 完整线上 API 闭环及隔离、Origin、CSRF、幂等断言 |
| `scripts/evidence-smoke.mjs` | 证据反转/重审/私有上传专项；目前端到端未通过 |
| `scripts/evaluate.ts` | 成对真实模型评估、逐案例 checkpoint、保留集开关 |
| `scripts/ops-status.mjs` | 健康和共享应用模型额度；不是实际云账单 |
| `scripts/deploy.sh` | 无流量 candidate 发布；人工/代理冒烟成功后再切正式流量 |

重要接口：`POST /api/sessions`，`GET /api/session`，`POST /api/evidence`，`POST /api/evidence/import`，`POST /api/images`，`GET /api/images/:id`，`POST /api/runs`，`GET /api/runs/:id`，`POST /api/runs/:id/reassess`，`POST /api/patches/:id/approve`，`POST /api/patches/:id/publish`，`POST /api/pages/:sku/verify`，`POST /api/pages/:sku/rollback`。

## 6. 本地运行、评估和检查

Node 22+；锁文件已提交，使用 `npm ci`。依赖精确版本以 package.json/package-lock.json 为准，当前 Next 16.4、React 19.3、Gen AI SDK 2.28。不要随手升级。

```sh
cd /Users/joeyzhao/Documents/MerchReflex
npm ci
cp .env.example .env.local
# 本机已有 ADC。只有需要重新认证时才运行：
# gcloud auth application-default login
npm run dev
```

浏览器 http://localhost:3147。Next 会加载 `.env.local`；独立 node/tsx 脚本不会自动加载，需要显式设置或用 `node --env-file=.env.local`。`.env*` 除 example 均不入 Git。不要把真实 Cookie、CSRF、token、用户云凭证贴进日志或 handoff。

```sh
npm test
npm run build
npm run typecheck
# build 与 typecheck 依次运行，不并发。

TEST_ORIGIN=https://merchreflex-927668522599.asia-southeast1.run.app \
  SMOKE_ID=zcode-01 node scripts/api-smoke.mjs
TEST_ORIGIN=https://merchreflex-927668522599.asia-southeast1.run.app \
  node scripts/evidence-smoke.mjs
GOOGLE_CLOUD_PROJECT=merchreflex-cup-2026 node scripts/ops-status.mjs
```

真实评估计费：

```sh
GOOGLE_CLOUD_PROJECT=merchreflex-cup-2026 GOOGLE_CLOUD_LOCATION=global \
  GEMINI_MODEL=gemini-3.8-flash STORAGE_DRIVER=firestore \
  EVIDENCE_BUCKET=merchreflex-cup-2026-evidence EVALUATION_MODE=1 \
  EVAL_OUTPUT=output/zcode-development npm run eval
```

默认仅 development。**不要现在直接打开保留集开关**；人工盲评准备好并冻结版本后才加 `EVAL_SPLIT=holdout RUN_FROZEN_HOLDOUT=yes`。复用输出目录会跳过已有案例，请用新目录记录新版本，避免混样本。评估模式使用独立日计数，但仍扣同一个全局美元账本；不要在生产服务打开 EVALUATION_MODE。

## 7. 云端资源与发布

| 资源 | 值 |
|---|---|
| Project | `merchreflex-cup-2026`，编号 `927668522599` |
| Cloud Run | `merchreflex`，`asia-southeast1` |
| Firestore | `(default)`，Native，新加坡 |
| 私有 bucket | `merchreflex-cup-2026-evidence`，禁止公开访问 |
| Runtime SA | `merchreflex-app@merchreflex-cup-2026.iam.gserviceaccount.com` |
| 模型 | `gemini-3.8-flash`，`global`，LOW thinking |
| 实例限制 | min 0 / max 2、并发 8、512 MiB、1 CPU、HTTP 120 秒 |
| 运行限制 | 90 秒、最多 8 次模型请求、6 次工具执行、最多一次修正 |
| 应用额度 | 模型 USD 25、正式每日 40 次、每会话 12 次、150 个新会话/日 |
| 预算 | 用户总预算 CNY 500；云预算 USD 65 告警 50/80/100%，不是硬上限 |

最重要的配置陷阱：`APP_ORIGIN` 必须保持用户访问的网址 `https://merchreflex-927668522599.asia-southeast1.run.app`。gcloud 的 `status.url` 会返回 `https://merchreflex-sqaibrdjbq-as.a.run.app` 别名；不能直接用它替换 APP_ORIGIN，否则原网址写入被 Origin 检查拒绝。deploy.sh 已改成显式配置，单次零流量部署，不再自动替换别名。

```sh
export GOOGLE_CLOUD_PROJECT=merchreflex-cup-2026
export EVIDENCE_BUCKET=merchreflex-cup-2026-evidence
export RUNTIME_SERVICE_ACCOUNT=merchreflex-app@merchreflex-cup-2026.iam.gserviceaccount.com
export APP_ORIGIN=https://merchreflex-927668522599.asia-southeast1.run.app
bash scripts/deploy.sh

TEST_ORIGIN=https://candidate---merchreflex-sqaibrdjbq-as.a.run.app \
  WRITE_ORIGIN=https://merchreflex-927668522599.asia-southeast1.run.app \
  SMOKE_ID=zcode-candidate node scripts/api-smoke.mjs
# 成功后，用 deploy 实际返回的新 revision 替换 NEW_REVISION：
gcloud run services update-traffic merchreflex --to-revisions=NEW_REVISION=100 \
  --region=asia-southeast1 --project=merchreflex-cup-2026
```

回退到本次已验证版本时使用 `--to-revisions=merchreflex-00008-jul=100`。应用页面回滚与 Cloud Run 代码回退是两个不同操作。所有数据读写使用最小服务账户权限，不生成长期服务账户密钥。

2026-10-13 10:45 上海的应用账本：spent 约 USD 3.419、reserved USD 1。是 token 估算/保守失败预留，不是实际账单；读取时仍有任务运行。崩溃可能留下额度预留，先核对执行记录，再决定是否清理，不能直接清零绕过预算。前十次模型记录已做真实调用，完整云账单仍待核对。

## 8. 已踩过的坑

1. 早期模型工具循环 + 大量思考使 90 秒超时。已改 LOW、受约束工具轮次、一次修正，完整证据也传入提案生成，不能因为模型没读取某工具就说资料不存在。
2. 早期 verifier 把删去泛化营销语、FAQ 问句本身当成无依据事实，产生错误拒绝。最新只检查实质事实、限制及与来源的矛盾，且不给生成者的解释。不要靠禁用核验提高成功率。
3. 完整嵌套 Zod 的 numeric bounds 直接给 Vertex 输出 schema 曾导致 HTTP 400，坏 revision 00006 已回退。现在 `lib/model-schema.ts` 将 decoder 数值限制转描述，运行时仍严格 Zod。`scripts/schema-smoke.ts` 已真实通过。
4. 模型结构不合法现在最多修正一次，仍失败就阻止批准。不要无限修正。
5. 回滚后复查不能把恢复出来的错误页面标为问题已解决。最新保留待重新审查的问题。
6. 当前偶发 SERVICE_UNAVAILABLE 仍存在；最新 source-flip 专项失败即证据。安全停止正常，但可靠性验收尚未达标。

## 9. 评估文件和提交草稿

可公开的原始合成数据及模型响应：`eval/results/2026-10-13-development/`，共 36 份成对记录和 summary；旧轮次 summary 在 `eval/results/history/`；正式/候选 API 简报在 `eval/results/release/`。

本地 `output/api-smoke-*.json` 可能包含完整会话及 CSRF，不要公开。只可公开 `api-smoke-result-*.json` 摘要。`output/` 整体被 Git 忽略，不要直接强制加入整个目录。

已提交到仓库、方便另一台机器接手的材料：

- `docs/submission/MerchReflex_Official_Template_Working_Draft.pptx`
- `docs/submission/MerchReflex_Official_Template_Working_Draft.pdf`
- `docs/images/dimension-reassessment-v4.jpg`
- `docs/DEMO-SCRIPT.md`、`docs/RESEARCH.md`、`docs/SUBMISSION.md`

同机完整中间材料：

- `output/official-template.pptx`：官方原模板 16 页。
- `output/deck-build/build.mjs`：artifact-tool 填充模板脚本；含本机绝对路径，迁移时需替换。
- `output/deck-build/validation.json`、`render.log`：结构校验信息。
- `output/pdf-review/slide-01.jpg` 到 `slide-16.jpg`：PDF 渲染，已逐页视觉检查，无遮挡/裁切。
- `output/screenshots/`：真实浏览器演示和历史失败截图。

草稿不是最终比赛 Deck：第 12 页需填人工评估，第 14 页需视频；当前导出环境没有模板 Google Sans 字体，PDF 使用可读的替代字体。最终如需严格视觉一致，请在 Google Slides 中用原模板字体重新导出，再检查所有页和 <5 MB。第 8 页架构图还可细化“后端读取私有图片再交给模型”的箭头，避免误读为模型直接有存储权限。

官方模板：https://docs.google.com/presentation/d/13rg7vW43mEH6DkpuusAE6fdoEylSFz8waNpE4RLzoUg/edit
提交页：https://hack2skill.com/event/aibuildercup2026/dashboard/submissions/6a5da99a444e4f43e5657a85
FAQ：https://aibuildercup.com/Faqs.html

## 10. 可以直接发给 Zcode 的接力指令

请接手 `/Users/joeyzhao/Documents/MerchReflex`，先读 `HANDOFF_ZCODE.md`、`docs/VALIDATION.md`，保留现有架构和品牌。当前已部署 revision 00008，核心链路能跑通，尚未通过连续五次公网与保留集人工验收。先检查本地/远端提交和线上指纹，完成 SERVICE_UNAVAILABLE 的有限可靠性处理、证据反转及私有上传专项、五次公网流程和最终版运行统计。准备人工盲评后才运行冻结的 12 个保留集。继续补比赛 PDF、英文视频及提交验收；需要商家访谈和真人测试时给用户简短具体任务。真实失败必须保留，不以放宽证据或审批约束换成功，不修改 Finfold/portfolio，不超过 CNY 500 总预算，不宣称获奖、营收或退货率改善。每次报告分别说明本地通过、提交推送、云部署和线上验证状态。
