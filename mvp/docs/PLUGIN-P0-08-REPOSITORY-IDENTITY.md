# PLUGIN-P0-08：公开仓库回执脱敏

2026-11-03；中控：本轮 GPT-6；实现 Maker：GPT-6.1；独立 Checker：baseline_checker；Human Gate：之。

## 发现与范围

P0-03 完整回归在基线 `5a731a0` 已有的 `front/README.md` 发现本机用户目录，触发 `test_repository_has_no_local_identity`。这是公开候选发布前的阻塞，不是 claim 修复引入的错误。原提交和未脱敏原件保留；不改写 Git 历史。

以本地 `2ef3410` 为父提交，只允许改 `front/README.md` 与本卡；保留历史失败、数量、时间与技术结论，只将两处本机用户名/仓库路径替换为明确的占位符，并说明相关错误为脱敏摘录。不得修改或弱化身份保护测试，不改后端、配置、凭据或业务库，不推送/合并/部署。

## 验证与关闭条件

1. 修复前完整回归日志保留：1 failed、500 passed、2 skipped；独立 Checker 已核失败路径来自基线原 blob。
2. 修复后运行既有仓库身份测试，再运行完整 MVP 回归；各进程隔离 HOME、USERPROFILE、TEMP、TMP、basetemp，禁用缓存和字节码，使用现有解释器。
3. Maker 自核原路径不再出现在当前文件；Checker 直接复核 diff、结果及提交 blob。既有远端历史不会因本次脱敏而消失，不能声称清除了历史记录。
4. 本卡完成只解除当前候选的身份检查阻塞；PR51 基线漂移、真实材料/多 Agent/旧库操作及产品接受等 Gate 仍各自开放。

## 当前状态

GPT-6.1 实现与自测完成；独立 Checker 已限定通过，Human Gate 待完成。

### Maker 自核

候选修改已完成。README 将共享临时目录用户名替换为 `<user>`，将 Git 锁文件错误中的仓库根替换为 `<repo-root>`。两处均标明路径已脱敏，原路径定向检查无命中，历史失败、数量与结论保留。`git diff --check` 通过。

使用 `D:/Hermes/venvs/knot/Scripts/python.exe`，进程 PATH 前置 `D:/Hermes/git/bin`，并设 `PYTHONDONTWRITEBYTECODE=1`。两个套件各用独立的 `<suite-root>`，HOME 和 USERPROFILE 指向其 `home/`，TEMP 和 TMP 指向其 `temp/`。实际命令及结果：

- `python -B -m pytest mvp/tests/test_repository_identity.py -q -p no:cacheprovider --basetemp <suite-root>/pytest`，2 passed in 1.19s，退出码 0。
- `python -B -m pytest mvp/tests/ -q -p no:cacheprovider --basetemp <suite-root>/pytest`，501 passed、2 skipped in 255.63s，退出码 0。

原始日志与 README 差异保存在 P0-03 私有交接目录的 `p008-maker61/` 下，对应 `identity.log`、`full.log` 和 `readme.diff`。

### 独立复核与 Gate

Checker 亲写 `CHECKER-P0-08.md`：两文件范围符合本卡，原 README 私有副本与父提交 blob 一致，身份测试未删改；独立身份模块 2 passed（1.38s），并读回 Maker 完整日志，不冒称独立重复全量。中控暂存新卡后又核身份模块 2 passed（1.58s），确保新卡进入 Git 跟踪文件扫描。

允许固定本地候选提交；提交后须独立绑定 commit/tree/blob。修复前失败与首次 HOME 副作用仍保留。Human Gate、推送、合并、部署与产品接受均未执行。
