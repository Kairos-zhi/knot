# KONT 中控指针

更新：2026-10-24；之“快步推进”，DESKTOP-015旧代码回滚候选已独立限定接受；DESKTOP-014保持限定接受。在用profile未改，模型授权不自动续用。
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
| DESKTOP-014 | ACCEPTED_LIMITED | Y/checker/final-review.json；25文件／16冻结项一致，build＋6项官方隔离检查 |
| DESKTOP-015 | ACCEPTED_LIMITED | Z/checker/final-review.json；15冻结项／旧安装12项／原package2项一致，独立7/7 |

证据根均在evidence/local/：K=20261021-kernel-adapter，R=20261021-backend-research，E=20261021-desktop，D=20261022-desktop-compat，N=20261022-run-contract，O=20261022-run-read，P=20261022-run-host，Q=20261022-run-config，S=20261022-run-guard，T=20261023-run-dispatch，U=20261023-run-integrated，V=20261023-run-live。
- 授权／范围：[收口卡](docs/tasks/CARD-KONT-20261022-RESUME.md)；执行侧：[QUEUE](QUEUE.md)；基准：[开发约束](docs/development-baseline.md)。
- 交付宿主：D:\DSH-Desktop，官方0.2.1-rc.2；历史已验证普通启动加载Knot。DESKTOP-015本轮进程观察未见主进程，未主动启停，不冒称当前active。原Headless／3081未替换。
- 上轮回执：Y/controller/receipt.json（Y=20261024-desktop-package）；本轮回执：Z/controller/receipt.json（Z=20261024-desktop-rollback）；索引：evidence/DESKTOP-015-INDEX.json；旧索引与收口保持。
- 旧叙事完整保留：[STATE归档](docs/archive/STATE-20261022.md)；旧QUEUE见同目录归档。
- 当前21单元＝19项ACCEPTED_LIMITED＋2项CLOSED，完整产品接受0。DESKTOP-015已Gate：旧installed代码12项与原package2项完整保留，实际转换0；官方manager离线隔离重装、旧runtime／renderer工厂通过，独立7/7，15冻结项一致。此为代码可重装，不证明升级后数据可降级或生产回滚。真实manager状态、数据兼容与正常重启仍须部署前核准；当前client管理脚本仍固定旧repo spec，须适配已审候选后再实际更新。新增模型0，RUN-011授权1/1已用。
- 未决：在用Desktop执行入口／正式Apple工作站、通用多用户授权／完整命令面／per-Agent权限、持久DSH Session恢复、强杀／断电与生产交付；dispose拒绝时不得自动关闭store。不得沿用已消费的单次授权再次付费请求。
