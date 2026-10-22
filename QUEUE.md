# KONT 执行队列

更新：2026-10-22。本页与STATE为当前入口；历史过程见docs/archive/QUEUE-20261022.md。
状态只允许：MAKER、CHECKER、GATE、ACCEPTED_LIMITED、CLOSED、BLOCKED。具体verdict及验收范围保留在原回执，不改写原历史冻结文件。

| ID | 真实执行入口／本轮归档复核人 | 状态 | 证据与范围 |
|---|---|---|---|
| KONT-KERNEL-001-A | kont_maker / kont_checker | ACCEPTED_LIMITED | K/checker/final-review.json；Headless窄切片 |
| KONT-KERNEL-001-B | kont_runtime_maker / kont_checker | ACCEPTED_LIMITED | K/runtime-maker/REPORT.md、K/checker/final-review.json；正常SIGTERM，不含强杀 |
| KONT-KERNEL-001-C | kont_checker | CLOSED | K/checker/independent-check-result.json；原27哈希、20测试与8组程序化实测 |
| KONT-RESEARCH-002-A | kont_seeker / kont_checker | ACCEPTED_LIMITED | R/checker/review.json；研究限定，不批准三项工程建议 |
| KONT-RESEARCH-002-B | seeker:aily（大荒谬）/ kont_checker | ACCEPTED_LIMITED | R/checker/b-review.json；任务7699079302595283968，4份9月28日文档rev2历史补证 |
| KONT-RESEARCH-002-C | kont_checker | CLOSED | R/checker/review.json、b-review.json；两路研究复核完成 |
| KONT-DESKTOP-003入口 | kont_checker（本轮归档复核） | ACCEPTED_LIMITED | E/checker/final-review.json；历史安装制作归属见QUEUE归档，不冒称本轮重装 |
| KONT-DESKTOP-003-COMPAT-A | kont_maker / kont_checker | ACCEPTED_LIMITED | D/checker/a-final-review.json、final-review.json；精确版本与client注册，非正式UI体验 |
| KONT-DESKTOP-003-COMPAT-B | kont_runtime_maker / kont_checker | ACCEPTED_LIMITED | D/checker/final-review.json、manifest-check.json；真实安装与正常重开，无debug终态 |
| KONT-RUN-004 | run_maker / run_checker / 中控Gate | ACCEPTED_LIMITED | N/checker/final-review.json；44/44＋11项；仅离线准备／关联投影／原子回流，无实际Run／桌面部署 |

根均为evidence/local/：K=20261021-kernel-adapter，R=20261021-backend-research，E=20261021-desktop，D=20261022-desktop-compat，N=20261022-run-contract。
CARD-KONT-20261022-RESUME已完成历史收口；之新授权“换窗口，继续开发”接续 KONT-RUN-004，旧回执STOP不再阻止本卡，不改写历史文件。
本轮仅一张工程卡，顺序Maker自测→独立Checker→Gate→回执。真实模型调用、桌面部署、push／合并未授权；不得冒称完整Run完成。
本卡Gate：ACCEPT_RUN_CONTRACT_LIMITED；当前10单元＝8项ACCEPTED_LIMITED＋2项CLOSED，完整产品接受0。中控仅留本地提交锚；真实DSH受信日志／完整上下文接缝须下一张小卡，不以合成测试顶替。
