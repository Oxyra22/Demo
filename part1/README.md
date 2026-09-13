# 作业一：礼物资产治理与排期原型

作者：Oxyra

我用这个包演示礼物生成任务的 JSON 契约、政策拦截、有限重试和断路器，并复现 50 个文化区域的排期计算。当前入口是 `governed-runner-v3.mjs`。包内没有模型服务、摄像头、GPU 渲染器或发布接口。

## 运行

我在 Node.js 22.14.0、npm 10.9.2 上完成本次验证。安装 Node.js 22 或更新版本后，进入本目录即可运行，无需安装第三方依赖，也不需要 API 密钥。

```sh
cd part1
npm start
npm test
npm run test:planning
npm run check:examples
```

`npm start` 在终端依次输出正常、合成政策拦截、重复几何错误三个场景。它不会启动网页或网络服务。指定场景及查看完整轨迹：

```sh
npm run demo -- religion --full
npm run demo -- geometry --full
npm run plan
npm run plan -- --full
npm run test:all
```

我在这个独立目录实测的结果：

| 命令 | 结果与计数范围 |
|---|---|
| `npm test` | 90 项 Node 测试通过：当前 v3 的 72 项，加 v2 的 18 项兼容性回归；另有 pipeline 的 28 条独立断言通过。 |
| `npm run test:governance` | 仅运行当前 v3 的 72 项测试。 |
| `npm run test:planning` | 47 项通过：容量/权限/QA 12 项、关键路径 19 项、当前日历与经济门 16 项。 |
| `npm run check:examples` | 调用 JSON、拒绝 JSON和完整合成适配器示例通过。 |
| `npm start` | 正常场景 1 次尝试/1 次模拟渲染；政策修复 2/1；重复几何错误在 2/2 时断路。所有场景 `published=false`。 |

pipeline 输出中的 8 个审计门已含在 28 条断言的检查范围内，我不将它们重复加总。90 项涵盖不同版本的回归，不能写成 90 种独立现实风险全部通过。详细输出保存在 `evidence/test-all.txt`。

## 文件入口

| 路径 | 我保留它的用途 |
|---|---|
| `docs/part1_正式正文.md` | 冻结的作业一正文，包含架构、核心生成 Prompt、重试与止损设计。 |
| `governed-runner-v3.mjs` | 当前执行入口：JSON 校验、冻结合同/政策/预算、适配器数据隔离、截止时间检查、HIGH 拦截、UNKNOWN 转人工、LOW 有证据修复和几何重复断路。 |
| `governed-scenarios-v3.mjs` | 三组可重复的合成适配器。 |
| `tests/governed-v3*.test.mjs` | 当前 v3 测试，含恶意适配器、引用篡改、在途政策过期与超时反例。 |
| `governed-runner-v2.mjs`、`tests/governed-v2.test.mjs` | 早期运行器及其回归基线。默认场景不调用 v2；接入适配器请使用 v3。 |
| `pipeline.mjs`、`tests/pipeline.test.mjs` | 早期确定性流程样例及其 28 条断言，用于复现原测试口径；其中候选与 QA 分数是固定样例。 |
| `planning/submission-plan.mjs` | 当前日历、分文化审核池、经济证据门及全量条件重排的计算入口。 |
| `planning/critical-path.mjs`、`planning/capacity.mjs` | 前后序排程和早期容量对照；单看早期容量不能承诺当前日期交付。 |
| `schemas/generation-response.schema.json` | 生成响应的 JSON Schema 形状示例。执行许可和动态预算仍由 v3 运行器按冻结合同校验；我没有额外引入通用 Schema 校验库。 |
| `examples/` | 合同、合成政策、合法调用、拒绝响应和未填写的沟通成本实验表。 |
| `evidence/` | 本地测试与演示输出。 |
| `source-manifest.json` | 复制文件的哈希，便于确认运行器和冻结正文的版本。 |

## 证据边界

我验证的是控制流和排程算术。生成、内容检查、渲染与几何检查由合成适配器返回预设结果，渲染结果只是一条模拟资产 ID。场景名 `religion` 和 `SYNTHETIC-FORBIDDEN-01` 用于测试政策分支，没有绑定真实宗教符号，也没有测量实际模型的违规识别能力。

默认预算为最多 3 次生成尝试、12 个抽象成本单位及 30 秒墙钟时间，每次生成预留 4 单位。成本单位是测试记账参数，不能当作人民币、美元、token 或 GPU 实付。超时会阻止后续派发并向适配器发出 AbortSignal；真实供应商能否取消在途计算、是否收费，仍需接入后核验。

政策数据由调用方按授权边界提供。本包检查数据内容与作用范围，但没有连接真实政策服务、签名验真、当地审核或发布审批。示例政策使用合成 ID 和固定未来过期时间，方便离线复现，不代表实际政策有效期。`REVIEW_READY` 表示等待人工批准，所有结果均保持未发布。

我保留 50 个区域的业务目标。排程样例为 50 个父需求、51 个 SKU，其中一条需求有两个变体；10 区只是在当前资源与假设日期下的不足量结果，没有范围变更批准。2026 年 10 月 1 日为测算假设，当前日历模型的全量条件重排最早建议 10 月 20 日发布，须业务批准。合成排期、预留 438 主动工时和假设经济门均不代表已经生产、已经取得人员资源或真实 ROI 达标。

本包仅在本地完成整理和验证。公开审阅范围不含私人录屏、人脸、密钥、设备路径、依赖安装目录或历史审核输出集合。
