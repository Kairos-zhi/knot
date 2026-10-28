# Knot 文档地图

> 历史文档索引：以下保留旧桌面阶段的阅读路径和当时状态，不代表当前 MVP 排期或实现。当前入口见根 [STATE](../STATE.md)／[QUEUE](../QUEUE.md) 及 [MVP 开发基准](../mvp/docs/development-baseline.md)。

更新：2026-10-18。先理解产品，再看当前状态；需要实施时再进入架构、验收与源码。产品愿景使用 P0–P4 表达，工程交付只认五阶段与 G0–G8 的统一映射。

## 推荐阅读路径

1. [产品介绍](product/introduction.md)：先理解“让思考留下来，让创造接着发生”的工作现场。
2. [产品总览](product/overview.md) 与 [交互约定](product/interaction.md)：确认对象、供给、呈现和人的覆盖权。
3. [路线图](product/roadmap.md)：查看 P0–P4 如何落到五阶段与 G0–G8，不把愿景阶段当成另一套排期。
4. [当前状态](development/status.md) 与 [协议与操作入口](architecture/protocol.md)：区分已实现、已验证、占位和未建。

## 当前文档

| 文档 | 回答的问题 |
|---|---|
| [产品介绍](product/introduction.md) | 一分钟向使用者或协作者说明 Knot |
| [产品总览](product/overview.md) | 用户、价值、形态、首轮工作与长期方向 |
| [哲学与 AI 原生范式](product/philosophy.md) | 资产化、共用环境、活结、主动协作与人的覆盖权 |
| [交互约定](product/interaction.md) | 查看、供给、切换、三态、关闭与断开分别发生什么 |
| [路线图](product/roadmap.md) | 五阶段与 G0–G8 如何对应、当前在哪 |
| [架构地图](architecture/overview.md) | 各能力由谁拥有、当前实现与目标差在哪里 |
| [状态与持久化](architecture/state-and-persistence.md) | 真实字段、身份、事务、快照与写回边界 |
| [协议与操作入口](architecture/protocol.md) | HTTP 已有什么，本地新 API 到哪里 |
| [运行适配](architecture/runtime.md) | DSH、Codex、Hermes 的职责与缺证项 |
| [设计原则](design/principles.md) · [设计系统](design/system.md) | OS 熟悉感、克制表达与旧参数如何使用 |
| [当前状态](development/status.md) | 已合入、已独立接受、待验与未实现 |
| [近期计划](development/plan.md) | W0–W6、下一交付及结束条件 |
| [验收](development/acceptance.md) | 三轮真实工作、失败、恢复和权限怎样验证 |
| [团队与协作](development/team.md) | 当前身份、需要的职责与入场方式 |

## 研究、原方案与演变

- [研究索引](research/README.md)：Apple 九篇、技术与游戏线、设计规格及采用关系。
- [对标结论](research/comparisons.md)：只讲 Knot 采用什么、怎样转译、什么仍待验证。
- [Apple 九篇索引](research/apple/README.md)：专题全文保留历史日期。
- [原方案与历史索引](history/README.md)：四份 9 月候选、原始 roadmap、形式层与协议冻结正文。
- [决策演变](history/decisions.md)：阶段演变、冲突与已撤回设计。
- [来源登记](history/sources.md)：源文件、日期／revision、整理方式及缺口。

`knot-flowgram-app/docs/` 的旧架构、协作和交接文档仍保留历史正文，并增加现行入口。应用中文模板 README 属于上游工程参考。历史任务卡不是当前排期。

## 阅读中的四种状态

“方向已定”说明产品原则；“实现已入库”说明代码存在；“指定范围已验证／独立接受”说明证据边界；“完整产品已验收”需要真实场景、运行、恢复与人的体验共同通过。四种状态不能互相替代。

当前文档覆盖本轮相关产品和研发知识，不是所有私人会议、个人哲学、运行记录或整个共享资料库的镜像。未纳入来源在来源登记中明确列出。
