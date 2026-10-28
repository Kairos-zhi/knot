# KNOT-MVP-W1D4-FRONTIER17-001 · 本地迁移记录

日期：2026-10-28。archive_id：`knot-mvp-w1d4-frontier17-001-20261028`。
状态：独立本地候选Gate限定通过，无剩余阻断。检索键：`Frontier17`、`22391`、
`event_atom_map`、`SCC`、`256 differential`。

## 受理与来源冻结

用户授权继续开发，按卡从干净main `6f763c0` 建立 `feat/knot-frontier17`。
任务卡、event_atom拍板、已有schema/迁移器、Repo、连接层及验证代码已查。
沿用此前已读治理与开发基准；本卡不改CI、不生成SCHEMA.md、不迁真实库。

先把指定源脚本逐字节复制为
`mvp/tests/fixtures/frontier17_reference_20261027.py`，并追加精确-text属性。
源及冻结副本开工/自核后实算SHA256均为：

```text
056528f4e11ce652084ae5694b9eeda23ef44c9bd2d782b352ed49b47e76b1cd
```

没有改源脚本。core直接提取其前186行（原三组验证循环之前），全部类/函数的
AST、函数名和签名与参考对应定义相同；未优化算法或改比较口径。
core允许checkout换行与末尾空行差异，不作字节pin；只有冻结fixture逐字节固定。
标准库import不变，核心无文件、SQLite、网络、打印或输入调用。

## 两笔提交与数据边界

第一笔 `43343ff`：schema v1.2增量表、迁移、初始化版本显示与约束测试。
已获独立限定Gate，详见 [schema记录](W1D4-schema-v1_2.md)。
第二笔为核心、SELECT-only DB适配、冻结副本及差分测试和本记录，独立Gate已通过。

适配层保持核心纯函数。event_atom_map是唯一映射事实源；卡保留的event_atom
关键字在API中默认为None，若显式传入，只允许与表中映射相同，不能覆盖数据库。
规则仅取指定版本且active=1，原子词表为规则head/body并集排序。
eligible精确匹配snapshot_time。一事件多原子、eligible缺映射或词表外原子显式报错。
incremental适配从库全算旧快照再增量算新快照，返回终态dict，与evaluate适配一致。
规则/映射在一次计算中固定；不实现动态规则缓存迁移或支持族持久化。
三个DB函数只发SELECT，连接及并发一致性读事务由调用方管理。

## 自核验命令与对账

```sh
python -m pytest mvp/tests/test_frontier17.py mvp/tests/test_schema_v1_2.py -s -q --tb=short -p no:cacheprovider
python -m pytest mvp/tests/ -q --tb=short -p no:cacheprovider
git diff --check
```

环境：Python3.11.15 / SQLite3.53.1 / pytest9.1.1。未新增依赖。
新增11项测试 9.53s，满足新增部分≤15s；全量54/54通过（18.74s）。
全量耗时包含原43项，不与新增部分15s门混淆。

验证循环直接复用冻结参考的test函数代码体：参考实现跑一次，迁移实现同种子
跑两次。仅替换这些冻结循环的核心函数global绑定，不改循环、断言或随机调用。
三跑数字相等，模型三跑合计8.277s。迁移实跑输出逐行与卡相同：

```text
Exhaustive transition+release comparisons: 16384 PASS
Random multi-atom transition+release comparisons: 6000 PASS
Targeted cross-layer counterexamples: 7 PASS
Random SCC recomputations: 9182 / 18446 candidate SCC evaluations
Exhaustive SCC recomputations (count, not wall clock): 14144
ALL ROUND-17 MODEL ASSERTIONS PASSED; frozen baseline + two port runs equal
```

独立差分固定Random(170027)生成256例，逐项比较incremental_scc的完整二元组、
released、notification_delta、authorized_outbox（含refresh=False）：

```text
Differential cases: 256/256 PASS; incremental/released/delta/outbox
DB case 1 PASS: snapshots/active/version/read-only; incremental == full
DB case 2 PASS: table ez:z -> ez:x changes support; caller override rejected
DB case 3 PASS: ValueError: event 'ez' maps to multiple atoms ('x', 'z'); Frontier17 requires one atom per event
```

DB用例≥3条规则、两个快照，authorizer仅允许SELECT/READ/FUNCTION，覆盖三个适配函数。
修改表映射会改变x/z支持，证明未使用调用方mapping替代表；失活及其他版本被排除。

## AC逐项

| AC | Maker结果 |
|---|---|
| 1 | 原源及冻结副本SHA完全匹配，-text属性 |
| 2 | 穷举16384 |
| 3 | Random(170027)，随机6000 |
| 4 | 原P17-01～07代码体，7反例 |
| 5 | 16384+6000+7=22391 |
| 6 | random9182/18446，exhaustive14144 |
| 7 | 256/256例，四样输出逐项相等 |
| 8 | 原基线一次、迁移两次，五组统计相同 |
| 9 | DB终态相等、快照切换、失活/版本隔离、改映射改变结果 |
| 10 | 全量54绿，核心stdlib检查通过 |
| 11 | 新增11项9.53s≤15s |
| 12 | 核心AST同源，禁用调用/非标准库import检查通过 |
| 13 | 新库三版本、表列/PK/FK/RESTRICT，第一笔独立Gate通过 |
| 14 | 迁移两次输出见schema记录；非空保全/失败回滚/未知缺库拒绝 |
| 15 | 实际ValueError如上，不静默取首个 |

## 独立Gate与收口范围

schema独立复核已通过。算法独立复核：新增11/11（9.19s），原模型三跑7.492s，
全部五组统计精确对齐，256差分通过；全量54/54（19.47s）。另独立验证
SELECT-only authorizer、total_changes不变、eligible反向撤销和非eligible事件
多原子也显式报错。原源与fixture逐字节相等，SHA及-text属性正确。
README的Day 3旧“未合并”状态已按本卡基线改为PR #22/main6f763c0。
最终文档Gate已由独立Checker限定通过，无剩余阻断，不由Maker自验收。
仅验证冻结的有限正Horn模型与本地只读DB适配，不声称真实A2A、动态规则、
现场撤权、物理侧信道或完整产品接受。不推送、不合并、不迁真实库；
Day 5与Week 2工作不在本卡范围。
