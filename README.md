# Knot · Agent OS 新范式

Knot 给人和 Agent 一个共同的工作环境：材料、想法、会话和产物可以留下来，成为能继续引用、连接和加工的资产。连接让思考继续生长，思考再被资产化，人与 Agent 围绕同一组对象共建；活结可以重选和断开，但人的选择权始终在场。

**极致的聚焦，优雅的交互，便捷的连接与使用。**

当前开发基线是工作站。详细操作在工作站完成；内部桌面用文件夹、图标、窗口和卡片组织现场。用户也可以选择把同一个现场放到外部浮窗或小组件，深入操作时回到原处。HUD 承接输入，工作岛承接真实活动，关系画布按需打开。

## 从这里读

| 你想了解什么 | 入口 |
|---|---|
| 三分钟理解产品 | [产品介绍](docs/product/introduction.md) |
| 产品是什么、为谁存在 | [产品总览](docs/product/overview.md) |
| 交互和美学 | [交互约定](docs/product/interaction.md) · [设计原则](docs/design/principles.md) |
| 接下来做什么 | [路线图](docs/product/roadmap.md) · [近期开发计划](docs/development/plan.md) |
| 已经做了什么 | [当前开发状态](docs/development/status.md) |
| 架构、数据和协议 | [架构地图](docs/architecture/overview.md) · [协议边界](docs/architecture/protocol.md) |
| 为什么这样设计 | [对标与采用结论](docs/research/comparisons.md) · [研究全文索引](docs/research/README.md) |
| 加入开发 | [团队职责](docs/development/team.md) · [验收](docs/development/acceptance.md) |
| 历史与完整来源 | [文档总索引](docs/README.md) · [演变与撤回项](docs/history/decisions.md) |

建议阅读顺序是“产品介绍 → 产品总览／交互约定 → 路线图 → 当前状态”。产品介绍吸收愿景中的产品哲学；路线图把 P0–P4 作为产品表达，映射到唯一的五阶段与 G0–G8 工程门，不另起一套排期。

## 当前可以确认什么

主分支此前已合入 [PR #8](https://github.com/Kairos-zhi/knot/pull/8)：工作现场隔离与保存恢复、只读输入编译、本地请求适配，以及原 PR #6 的 Canvas Bridge 修复。三段新增服务层代码各有原独立接受记录，合并前完成类型检查、七套行为测试和生产构建。

2026-10-27，本分支接入同一 Knot 的 [DSH 桌面模块](knot-desktop/README.md)，包括已分项核验的工作现场组织、HUD、工作岛、Store 快照和 Run 对账。KONT 只是历史误拼，技术包名暂保留兼容。接入工程源门已独立限定通过，主线合并另行审阅；范围见 [STATE.md](STATE.md) 和 [048 任务](docs/development/desktop-integration.md)。

**新版 OS 工作站整体尚未完成；FlowGram 参考应用的生成服务仍为 mock。** 两种承载复用同源核心，目前各自持久化，未完成双端统一运行态。真实 Desktop 体验、完整 Codex／Hermes 协作、取消恢复、原生浮窗、NAS 和 Jev 仍按路线逐项验收。

源码接入、离线回归、在用软件更新与人的体验分别记录，不能互相替代。

## 运行现有工程

桌面模块的构建和离线验证见 [模块入口](knot-desktop/README.md)。运行测试不需要打开桌面软件或调用模型；安装和在用更新按具体候选另行授权。

现有可运行界面仍是 FlowGram/React 参考实现。进入应用目录：

```sh
cd knot-flowgram-app
npm ci
node scripts/start-all.mjs
```

开发页面和协议服务分别使用 3002、3101 端口。启动服务会启用现有资产写回，请使用自己的开发副本。验证新内核可直接运行服务层测试，见[验证入口](docs/development/status.md)，无需启动页面或调用模型。

当前已验证环境为 Node 22.22.3。普通 `npm test` 和 `npm run build` 是旧空脚本，不能作为验证成功的证据；真实构建使用 `npm run build:prod`。

## 文档如何判断新旧

当前产品语义和开发状态以 `docs/` 下的现行文档为入口；源码与实际验证说明实现边界。历史候选、研究和早期规格保留在明确标记的历史目录。研究中的厂商数字、价格和竞品判断保留原日期，不自动成为今天的事实或 Knot 的承诺。

新增能力先查既有方案、代码与测试，确认缺口后做最小改造。人和 Agent 共用操作内核；Maker 和 Checker 分离；合并需要明确授权。
