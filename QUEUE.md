# Knot 执行队列

更新：2026-11-03。[PLUGIN-W1D1-BASELINE-001](mvp/docs/PLUGIN-W1D1-BASELINE-001.md) 正修订 #51 基线并登记同步增量。工程任务按用户后续授权和具体任务卡推进，GPT-6 中控、GPT-6.1 实现、独立 Checker 复核。

| 卡 | 状态 | 责任及关闭条件 |
|---|---|---|
| PLUGIN-W1D1-BASELINE-001 | 初版 `afb53de` 限定复核通过；#51 增量待独立复核，增量读回待登记 | Codex Maker + 独立 Checker + 之 Gate；不将本地提交视作全员送达 |
| P0-01 路线/来源 | 本地原件/入口已固定，文档限定复核通过 | Codex：新旧路线适用性、原件/hash、附件不授予执行权 |
| P0-02 运行/候选归属 | 案例环境及服务进程链已定位；全入口排他仍未证 | Codex 与原服务拥有者：库/服务/写入者及未提交产物分开登记 |
| P0-03 多 actor 幂等 | [#52](https://github.com/Kairos-zhi/knot/pull/52) 开放草稿，未合并 | 已独立复核候选；多 actor 写入口仍有发布和接入 Gate |
| P0-04 输入/reader | 补卡，未实施 | 后续宿主适配 Maker + Checker；正文接入前核输入时点、撤选与身份切换 |
| P0-05 来源/查找 | 补卡，未实施 | 后续来源适配 Maker + Checker；样本来源与实际查找入口，不默认全库导入 |
| P0-06 证据绑定 | 历史缺口保留 | F1/N1 原负责人及独立 Checker；采用候选前补证，不编造缺失历史日志 |
| P0-07 上下文送达 | 四个 Codex 窗口已有旧读回；Hermes 人工读回原通知；Dot 用户确认在线，接入通知待回执；本次增量已启动 | Codex 发起；保持原通知，不冷启动/重复派发，不虚构领取 |
| P0-08 公开回执脱敏 | #52 候选已修复，Maker 全量 501 passed、2 skipped | 保留失败原件与历史；候选已独立复核，Human Gate 待定 |

每项详细来源、允许文件、反例和验收见 [P0任务卡台账](mvp/docs/PLUGIN-P0-REGISTER.md)。P0 指对应接入/Gate 前须处理，不等于本轮全做代码。

## 保留而不自动推进

- L2a/CLI/HTTP 整链保留，历史复核不替代新集成与人类 Gate。
- F1 #49、N1 #50 已合入远端 main `5a731a0`。P0-06 的历史证据缺口按原任务分别追溯。
- DSH 001B 留作对照；旧 headless PoC、深度定制、模型/profile/预算不继承为当前卡。
- L1 对象事件、L2 有界展开、L3 cancel/终态通知、L4 仍为建议，不是所有插件工作的硬前置。
- 导出、walk 副本、失败安装、旧 pin 和生产数据保留；旧材料“清理”不构成本轮删除授权。

开发、推送、合并、在用部署和产品接受分别登记。旧队列见 [QUEUE@6977bc2](https://github.com/Kairos-zhi/knot/blob/6977bc29e18481cf930dca96bdbecd1cee0503d0/QUEUE.md)。
