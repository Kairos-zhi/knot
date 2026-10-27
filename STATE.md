# Knot 当前执行状态

## 050 · 结论件派生发布

当前工作分支为 `codex/evidence-receipts-050`，基于049-r2同步提交958d0aa。用户授权按已讨论结论推送公开结论包；本卡只整理文档，不改产品、原始回执或测试fixture，不合并main或更新在用软件。

[结论包](knot-desktop/evidence-receipts/README.md)收录214份来源材料（含41历史索引、55人读材料），补齐048源门/候选执行/发布及049-r1失败/r2修复链。原件冻结，副本受逐source SHA及JSON Pointer/文本span白名单约束；7处运行元数据表投影注明原条目数，不称全部只改路径。公开包内部校验不等于未公开原件的独立语义复核。制作、独立Gate和实际发布分别核对，精确提交/草稿PR以本分支记录为准。

当前软件候选仍为ed54934/pin7ac0…，本次文档HEAD不构成新软件候选。旧真实模型许可与分项限定验收按原值保留，不把本轮零调用改写为所有历史均零。任务见[050发布约束](docs/development/receipts-publication.md)。

## 049 · 当前进度与统一入口

已完成049同步基线分支为 `codex/local-sync-049-r2`，承接049文档提交 `35f6d4247858d1684f9e437e58d9e7a9c398039c` 和代码提交 `ed54934095a2788405d1c7839067735fe265807f`。常用项目目录为后续开发入口，聊天隔离工作区保留同提交副本；二者读取相同根 STATE.md / QUEUE.md。后续任务完成时独立核最新提交/远端及副本一致性，旧047状态不再作为当前入口。见[同步记录](docs/progress/20261027-synchronization.md)与[049任务](docs/development/local-sync.md)。

048源门、真实HEAD候选及发布独立复核均已通过：`ACCEPT_MAINLINE_MODULE_CANDIDATE_ISOLATION_LIMITED`；[草稿PR15](https://github.com/Kairos-zhi/knot/pull/15)，base main，1commit/300files，head ed54934。已核v3候选源为该提交，26文件pin `7ac0e3ab13b680de16403bcf62ff290959bfdf9fa7024f804e6885f2e7308c18`；官方0.2.1-rc.2临时profile offline验证26复制/runtime8/workstation10/清理订阅0，生产未更新。独立235/11/3分别记录、不相加。

049只同步说明、根忽略规则与本地入口，不改产品或重制候选；软件候选仍绑定ed54934，不能把文档同步HEAD当新软件候选。910旧本地忽略证据原地核SHA保留；90旧.runtime文件仅核路径/size/mtime，不读内容或运行。695旧跟踪证据另做物理归档并保留于a05历史/旧refs，不继续占用新代码树原路径。最终切换须检查新提交碰撞，禁止覆盖忽略文件；失败即停，不强制清理。

r1切换后的保全读回发现：90是逻辑路径，其中66真实运行路径元数据保持，24为旧junction指向root/packages下的公开代码引用，随代码迁移而悬空。r2以本机固定root/packages junction指向唯一knot-desktop/packages恢复旧引用；原.runtime及D盘链接/数据不改，不新增副本或Store，不启动旧运行环境。24项代码引用的checkout时间变化明确保留，不称原90项全部元数据未变；软件26字节与ed/a05一致。

main仍08a2a5340edab920ce942173ba63b2c5bc369eb4，PR15未合并。本轮不包含主线合并、生产安装、真实Session读取或模型调用。G3/G4/G5与原未决边界保持。

## 048 · 源门阶段历史记录

2026-10-27。KONT 是 Knot 的历史误拼，同一个项目；旧技术标识与任务编号继续保留兼容。

当前任务 [048 主线接入](docs/development/desktop-integration.md)：ACCEPTED_LIMITED，独立源门 `ACCEPT_MAINLINE_DESKTOP_MODULE_INTEGRATION_LIMITED`，无阻断。以原 main `08a2a5340edab920ce942173ba63b2c5bc369eb4` 建立普通分支，接入固定 `a05aab4c2941b7c80a8c4221aa9b90070c534d04` 的桌面实现，不拼接独立 Git 历史。独立构建与 40 套离线检查 235 项通过，最终受影响候选专项 11 项及自有 3 项通过；版本和重叠不相加。382 份原 main 路径 Git 内容无差异。

源门在提交前核定；真实新 HEAD 候选、官方隔离与发布读回独立登记。精确提交、推送与主线草稿 PR 的标识以该分支 Git/PR 记录为准，不能据源门声称主线已合并或在用部署。

此前桌面能力：工作现场组织、窗口/卡片/图标、HUD、工作岛、完整 Store 快照、运行读取与显式对账均有分项限定接受。046历史代码候选源为 `81afa22a483baf6c2da4f9d45f29d5669acabf10`；[旧进度报告](knot-desktop/docs/progress/20261027-local-development.md)保留当时范围，不是当前候选指针。旧 [PR12](https://github.com/Kairos-zhi/knot/pull/12)、[PR13](https://github.com/Kairos-zhi/knot/pull/13)、[PR14](https://github.com/Kairos-zhi/knot/pull/14) 是原历史审阅链，不是主线合并记录。

本次接入不更新在用软件，不新增模型调用。原 FlowGram 承载与桌面模块同源核心、各自持久 owner；双端统一运行态、真实 Desktop/G3 与人的体验、稳定外部双端/G4、连续三轮/G5仍未完成。旧 017 恢复不兼容；044 合成恢复正例固定 d59，不外推至新候选。

唯一路线仍为[五阶段与 G0–G8](docs/product/roadmap.md)，W0–W6 为工作分解。历史接受不等于完整产品验收。
