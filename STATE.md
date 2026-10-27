# Knot 当前执行状态

2026-10-27。KONT 是 Knot 的历史误拼，同一个项目；旧技术标识与任务编号继续保留兼容。

当前任务 [048 主线接入](docs/development/desktop-integration.md)：ACCEPTED_LIMITED，独立源门 `ACCEPT_MAINLINE_DESKTOP_MODULE_INTEGRATION_LIMITED`，无阻断。以原 main `08a2a5340edab920ce942173ba63b2c5bc369eb4` 建立普通分支，接入固定 `a05aab4c2941b7c80a8c4221aa9b90070c534d04` 的桌面实现，不拼接独立 Git 历史。独立构建与 40 套离线检查 235 项通过，最终受影响候选专项 11 项及自有 3 项通过；版本和重叠不相加。382 份原 main 路径 Git 内容无差异。

源门在提交前核定；真实新 HEAD 候选、官方隔离与发布读回独立登记。精确提交、推送与主线草稿 PR 的标识以该分支 Git/PR 记录为准，不能据源门声称主线已合并或在用部署。

此前桌面能力：工作现场组织、窗口/卡片/图标、HUD、工作岛、完整 Store 快照、运行读取与显式对账均有分项限定接受。最新代码候选源 `81afa22a483baf6c2da4f9d45f29d5669acabf10`；[进度报告](knot-desktop/docs/progress/20261027-local-development.md)保留当时范围。旧 [PR12](https://github.com/Kairos-zhi/knot/pull/12)、[PR13](https://github.com/Kairos-zhi/knot/pull/13)、[PR14](https://github.com/Kairos-zhi/knot/pull/14) 是原历史审阅链，不是主线合并记录。

本次接入不更新在用软件，不新增模型调用。原 FlowGram 承载与桌面模块同源核心、各自持久 owner；双端统一运行态、真实 Desktop/G3 与人的体验、稳定外部双端/G4、连续三轮/G5仍未完成。旧 017 恢复不兼容；044 合成恢复正例固定 d59，不外推至新候选。

唯一路线仍为[五阶段与 G0–G8](docs/product/roadmap.md)，W0–W6 为工作分解。历史接受不等于完整产品验收。
