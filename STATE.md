# KONT 中控指针

更新：2026-10-24；之要求继续推进，RUN-013只读现场面板候选已限定接受。RUN-011单次模型授权已消费，不自动再请求。
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
| RUN-011 | ACCEPTED_LIMITED | V/checker/final-review.json；core21＋wire4；真实Flash 1POST／completed／单块来源／独立重开 |
| RUN-012 | ACCEPTED_LIMITED | W/checker/final-review.json；A8＋B r2 4项，集成／认证2项；只读接口与viewmodel |
| RUN-013 | ACCEPTED_LIMITED | X/checker/final-review.json；build＋11项／独立bundle组合1项；只读面板候选 |

证据根均在evidence/local/：K=20261021-kernel-adapter，R=20261021-backend-research，E=20261021-desktop，D=20261022-desktop-compat，N=20261022-run-contract，O=20261022-run-read，P=20261022-run-host，Q=20261022-run-config，S=20261022-run-guard，T=20261023-run-dispatch，U=20261023-run-integrated，V=20261023-run-live。
- 授权／范围：[收口卡](docs/tasks/CARD-KONT-20261022-RESUME.md)；执行侧：[QUEUE](QUEUE.md)；基准：[开发约束](docs/development-baseline.md)。
- 当前桌面：D:\DSH-Desktop，官方0.2.1-rc.2普通启动；已加载Knot，无临时调试端口。原Headless／3081未替换。
- 上轮回执：W/controller/receipt.json（W=20261023-run-query）；本轮回执：X/controller/receipt.json（X=20261024-run-panel）；索引：evidence/RUN-013-INDEX.json；旧索引与收口保持。
- 旧叙事完整保留：[STATE归档](docs/archive/STATE-20261022.md)；旧QUEUE见同目录归档。
- 当前19单元＝17项ACCEPTED_LIMITED＋2项CLOSED，完整产品接受0。RUN-013已Gate：当前现场只读状态面板／共享查询源与当前块定位，实际bundle程序化组合通过；非ReactDOM／视觉／人的体验验收，未部署在用Desktop。新增模型0，RUN-011授权1/1已用。
- 未决：在用Desktop执行入口／正式Apple工作站、通用多用户授权／完整命令面／per-Agent权限、持久DSH Session恢复、强杀／断电与生产交付；dispose拒绝时不得自动关闭store。不得沿用已消费的单次授权再次付费请求。
