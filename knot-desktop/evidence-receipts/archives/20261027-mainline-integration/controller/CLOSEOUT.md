# Knot 主线模块接入 · 048 收口

2026-10-27。KONT 为 Knot 的历史误拼；同一项目，代码接入分支已提交并推送供主线审阅。

1. 目标：基于 main 08a2a5340edab920ce942173ba63b2c5bc369eb4，将固定 a05 桌面实现迁入 knot-desktop。原 main 382 路径 Git 内容保持，根四文档有限增量；300 路径单提交 ed54934095a2788405d1c7839067735fe265807f。
2. 监听回收：沿用原 Maker/Checker。Maker 额度中断后中控接续制作，独立 Checker 分离并完成源/执行/发布三门；无新增定时监听。官方临时 profile 已清理，订阅 0。
3. 证据：222 来源映射/11 适配、26 产品原字节、59 公开历史代码 fixture；新 HEAD v3 候选 pin 7ac0e3ab13b680de16403bcf62ff290959bfdf9fa7024f804e6885f2e7308c18。源码、计划、提交、候选和官方隔离日志均在本归档，原失败记录留样。
4. 验收：独立源门 ACCEPT_MAINLINE_DESKTOP_MODULE_INTEGRATION_LIMITED；执行门 ACCEPT_MAINLINE_MODULE_CANDIDATE_ISOLATION_LIMITED。独立 build/portable235、最终受影响11、自有3（内含无Git历史15）分别记录、不求和；官方临时环境26/runtime8/workstation10与清理通过。暂存格式检查中501旧空白逐字节归因于13固定源文件，严格其余287；新API多余EOF已修，不通用豁免。
5. 入档：archive_id=knot-mainline-integration-048-20261027；检索键 Knot/KONT/主线接入/DSH/moduleRoot/v3/fixture。独立发布回执 SHA256 7f247b3e3f414ea3c65229c715c09def84eb5e597805337987de71cacab89d08；本归档 evidence-index.json 登记实际文件 hash，不改旧冻结回执。
6. 记录：[草稿PR15](https://github.com/Kairos-zhi/knot/pull/15)，base main，head codex/knot-desktop-integration-048，1commit/300files，已 attach。远端/本地/upstream ed549 一致；main 仍 08a。旧 PR12/13/14 与旧源码工作区保持，两工作区干净，无 reset/amend/force/merge。
7. 未决：主线尚未合并，在用软件未更新；原 FlowGram 与 DSH 仍各自持久 owner，禁止双主写。真实Desktop/G3、人过手、native/ReactDOM/实际App传输、外部双端/G4、三轮/G5未被本轮接受。无真实 Session/生产数据读取或新模型调用。旧017不兼容、044正例固定d59，不外推新生产配对。
