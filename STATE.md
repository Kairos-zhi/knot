# KONT 中控指针

更新：2026-10-23；之授权“按照战线快步推进”，KONT-RUN-010 r2官方组件集成纵切已限定接受；旧回执保持。
六态：MAKER / CHECKER / GATE / ACCEPTED_LIMITED / CLOSED / BLOCKED；LIMITED不等于完整产品接受。

| 单元 | 状态 | 证据（根见下） |
|---|---|---|
| KERNEL-001-A | ACCEPTED_LIMITED | K/checker/final-review.json |
| KERNEL-001-B | ACCEPTED_LIMITED | K/runtime-maker/REPORT.md |
| KERNEL-001-C | CLOSED | K/checker/independent-check-result.json |
| RESEARCH-002-A | ACCEPTED_LIMITED | R/checker/review.json |
| RESEARCH-002-B | ACCEPTED_LIMITED | R/checker/b-review.json |
| RESEARCH-002-C | CLOSED | R/checker/review.json、b-review.json |
| DESKTOP-003入口 | ACCEPTED_LIMITED | E/checker/final-review.json |
| DESKTOP-003-COMPAT-A | ACCEPTED_LIMITED | D/checker/a-final-review.json、final-review.json |
| DESKTOP-003-COMPAT-B | ACCEPTED_LIMITED | D/checker/final-review.json、manifest-check.json |
| RUN-004 | ACCEPTED_LIMITED | N/checker/final-review.json；44/44＋11项自有检查；仅离线服务契约 |
| RUN-005 | ACCEPTED_LIMITED | O/checker/final-review.json；51/51＋5项；官方库只读接缝／窄请求审计 |
| RUN-006 | ACCEPTED_LIMITED | P/checker/final-review.json；build＋focused12/12；同store宿主只读绑定／卸载屏障 |
| RUN-007 | ACCEPTED_LIMITED | Q/checker/final-review.json；build＋focused9/9；JSON只读配置装配候选 |
| RUN-008 | ACCEPTED_LIMITED | S/checker/final-review.json；build＋focused5/5；受控Agent单次stream保护候选 |
| RUN-009 | ACCEPTED_LIMITED | T/checker/final-review.json；build＋focused19/19；同Run持久占位／提交状态 |
| RUN-010 | ACCEPTED_LIMITED | U/checker/final-review.json；r2 build＋focused16/16；owned运行组件／原子synthetic回流 |

证据根均在evidence/local/：K=20261021-kernel-adapter，R=20261021-backend-research，E=20261021-desktop，D=20261022-desktop-compat，N=20261022-run-contract，O=20261022-run-read，P=20261022-run-host，Q=20261022-run-config，S=20261022-run-guard，T=20261023-run-dispatch，U=20261023-run-integrated。
- 授权／范围：[收口卡](docs/tasks/CARD-KONT-20261022-RESUME.md)；执行侧：[QUEUE](QUEUE.md)；基准：[开发约束](docs/development-baseline.md)。
- 当前桌面：D:\DSH-Desktop，官方0.2.1-rc.2普通启动；已加载Knot，无临时调试端口。原Headless／3081未替换。
- 上轮回执：T/controller/receipt.json；本轮回执：U/controller/receipt.json；索引：evidence/RUN-010-INDEX.json；旧索引与收口保持。
- 旧叙事完整保留：[STATE归档](docs/archive/STATE-20261022.md)；旧QUEUE见同目录归档。
- 当前16单元＝14项ACCEPTED_LIMITED＋2项CLOSED，完整产品接受0。RUN-010 r2已Gate；官方运行组件＋synthetic provider内部纵切已通过。完整上下文／真人／金额授权、DSH日志持久化恢复、真实模型及桌面入口尚未交付；dispose拒绝时不得自动关闭store。
- 未决：真实模型／完整Run、正式Apple工作站体验、完整命令面、per-Agent权限、强杀／断电恢复与生产交付。
