# KONT 中控指针

更新：2026-10-24；之“快步推进。快步”，DESKTOP-019一次性执行门已独立限定接受；真实安装授权本轮0，模型授权不续用。
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
| DESKTOP-016 | ACCEPTED_LIMITED | AA/checker/final-review.json；13冻结项，独立A13＋B4；五阶段Run丢失检测／安装拒绝 |
| DESKTOP-017 | ACCEPTED_LIMITED | AB/checker/final-review.json；17冻结项／13候选项，独立A3＋B4；五阶段journal保留 |
| DESKTOP-018 | ACCEPTED_LIMITED | AC/checker/final-review.json；11冻结项，独立9/9，真实2资产／0Run副本无损、原hash未变 |
| DESKTOP-019 | ACCEPTED_LIMITED | AD/checker/final-review.json；12冻结项／独立16项，临时官方安装1次／25文件一致 |

证据根均在evidence/local/：K=20261021-kernel-adapter，R=20261021-backend-research，E=20261021-desktop，D=20261022-desktop-compat，N=20261022-run-contract，O=20261022-run-read，P=20261022-run-host，Q=20261022-run-config，S=20261022-run-guard，T=20261023-run-dispatch，U=20261023-run-integrated，V=20261023-run-live。
- 授权／范围：[收口卡](docs/tasks/CARD-KONT-20261022-RESUME.md)；执行侧：[QUEUE](QUEUE.md)；基准：[开发约束](docs/development-baseline.md)。
- 交付宿主：D:\DSH-Desktop，官方0.2.1-rc.2；历史已验证普通启动加载Knot。DESKTOP-015本轮进程观察未见主进程，未主动启停，不冒称当前active。原Headless／3081未替换。
- 上轮回执：AC/controller/receipt.json（AC=20261024-desktop-paired-preflight）；本轮回执：AD/controller/receipt.json（AD=20261024-desktop-install-gate）；索引：evidence/DESKTOP-019-INDEX.json；旧索引与收口保持。
- 旧叙事完整保留：[STATE归档](docs/archive/STATE-20261022.md)；旧QUEUE见同目录归档。
- 当前25单元＝23项ACCEPTED_LIMITED＋2项CLOSED，完整产品接受0。019 Gate限定接受一次性初始升级门，独立16/16、12制作冻结项一致；临时官方enabled:true安装1次／复制25项匹配。真实只读descriptor 928f2873...77a9复核，生产claim不存在、human grant0。超时uncertain不是取消，已消费transport可能继续，不自动重试。下一步明确批准后才新鲜预检、官方生产manager安装一次并正常打开验证；生产context/cache/active仍未验，恢复安装未实现。新增模型0，RUN-011授权1/1已用。
- 未决：在用Desktop执行入口／正式Apple工作站、通用多用户授权／完整命令面／per-Agent权限、持久DSH Session恢复、强杀／断电与生产交付；dispose拒绝时不得自动关闭store。不得沿用已消费的单次授权再次付费请求。
