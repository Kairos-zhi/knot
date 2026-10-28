# KNOT-MVP-W1D5-SUPPORT-001 · 支持族本地记录

日期：2026-10-28。archive_id：`knot-mvp-w1d5-support-001-20261028`。
状态：两笔本地候选均获独立限定Gate，无剩余阻断。
检索键：`carry-forward`、`minimal_roots`、`empty closure`、`200 brute`。

## 既查、受理与两笔提交

用户授权开工，已读任务卡、快照/支持族定义、已有内核/DB适配/测试/API。
main基线 `f23855f3beeb08fee0e91790c7e83ba58f8dc19e`（PR #23），
分支 `feat/knot-support-view`。复用load_state与冻结evaluate_scc_full，不另写算法。

1. 第一笔 `d3231f7`：eligible_at carry-forward、原适配调用、Day 4测试增补和API。
   独立56/56与AC-1～4通过，分阶段改前/改后时间线见
   [第一笔记录](W1D5-eligible-fix.md)。
2. 第二笔：support_view.compute_support、支持族测试、当前API/本记录。
   本页及第二笔的最终Gate以独立Checker回执为准。

开工前已有两个未跟踪pyc，保留未动；测试统一禁写字节码，不把它们纳入提交。
本卡不改schema、内核或冻结副本，不建缓存、不做时间轴对比、CI或真实库迁移。

## 空快照口径锁定

开工发现AC-10“空快照全假”与支持族定义及默认种子冲突，已向用户提出。
用户确认按定义保留空支持集，并增加AC-10b；继而明确整条替换为：

`p ∈ boolean_closure(∅, rules)` → true/[[]]；不可达 → false/[]。

不能用body空不空分类；无条件事实经非空规则继续推导出的结论同样无条件成立。
用户已同步修订两份来源文件，本窗口重新读取核对确认，不自行更改外部任务卡。
默认空快照9原子中，question/evidence/counterexample/decision/open_question/
support_relation为true/[[]]；conditional_theorem/premise/proof为false/[]。
当p←[]与p←x并存时，非空支持是空支持的真超集，M(p)只保留[[]]。

## 实现与输出

compute_support仅load_state、evaluate_scc_full与确定性投影：
snapshot_time/rule_version为原生int，atoms按名字升序；每个根集事件ID排序，
根集列表按(长度,字典序)排序。boolean=bool(M(p))，eligible_count计来源事件数。
所有返回为原生JSON兼容类型，不读事件/资产正文、不按自由文本改变判定。
调用方持有连接与一致性读事务；函数不发BEGIN或其他写操作。

极小性自检放在测试中，覆盖每个手工和随机输出根集：
独立喂入Horn闭包必须充分；逐个去掉任何事件后必须失效。空根的充分性按
空集闭包检查，无可删除元素，极小性成立。不为运行接口重复枚举所有子集。

## Maker自核验

```sh
python -m pytest mvp/tests/test_support.py -s -q --tb=short -p no:cacheprovider
python -m pytest mvp/tests/ -q --tb=short -p no:cacheprovider
git diff f23855f -- mvp/backend/frontier17.py mvp/backend/schema_v1.sql mvp/tests/fixtures/
git diff --check
```

Python3.11.15 / SQLite3.53.1 / pytest9.1.1，未新增依赖。支持族专项13/13
（0.88s）；完整增加随机状态独立Python对账后，全量69/69（30.00s）。
耗时仅观测，无墙钟断言。core/schema/fixtures差异为空。

实际输出：

```text
AC-6 PASS: two JSON byte strings equal
AC-7 PASS: brute equality; every root sufficient; removing any event fails
AC-8 PASS: 200/200 random small models; brute equality + minimality
AC-10b PASS: p <- [] and p <- x; M(p)=[[]], M(x)=[[e1]]
```

手工5原子、4来源事件：p←x、p←y,z、q←p，两个事件支持x、另两个支持y/z。
p的稳定根集为`[["ev-a"],["ev-b"],["ev-y","ev-z"]]`，与brute_reference完全相等。
两次`json.dumps(sort_keys=False)`转字节相同。
随机固定Random(170028)，200组≤5原子/≤4事件；除brute对账外，另用Python按
(时间,插入序)计算最近状态，比对SQL eligible集合，避免只共享同一读错结果。

## AC对照

| AC | 核验结果 |
|---|---|
| 1～3 | 第一笔实读时间线：沉默延续、撤权保持、显式恢复与≤T包含 |
| 4 | 同时刻1后0取0，再写1取1；跨时刻以时间优先而非插入先后 |
| 5 | 完整字段/原生类型/JSON往返直接相等 |
| 6 | 两次JSON字节相同，根内及外层顺序符合定义 |
| 7 | 5原子4事件手工根集与brute相等，充分/删一元素失效 |
| 8 | 200/200小模型brute及极小性通过 |
| 9 | 每个输出boolean严格等于bool(minimal_roots) |
| 10 | 空规则返回空atoms；无根循环全假；无条件链及默认六真三假符合空集闭包 |
| 10b | 空根淘汰非空根，M(p)=[[]] |
| 11 | 缺映射、词表外、多原子均ValueError |
| 12 | authorizer只允SELECT/READ/FUNCTION，私有表额外禁读；被拒动作0，total_changes不变 |
| 13 | Maker全量69/69，无新增墙钟断言 |
| 14 | main至候选内核/schema/冻结副本差异为空 |

## 独立Gate与收口

第一笔独立Gate已通过。第二笔独立专项13/13（0.46s）、全量69/69（15.09s），
另以Random(510029)独立写300个小模型oracle（Python状态carry＋Horn闭包＋子集枚举，
不复用load_state/brute_reference）全部相等，含同刻重复状态。逐例双调JSON稳定，
authorizer仅允SELECT且禁私有表读取、total_changes不变；默认六真三假独立核定。
最终排版后专项13/13通过，核心/schema/fixtures相对main无差异。
第二笔代码及文档已获独立限定Gate，无剩余阻断，不由Maker自验收。
此范围仅本地查询语义与支持族投影，随机覆盖为小规模，不声称大规则集性能、
跨连接并发事务、前端显示或完整产品接受。不push、不合并、不迁真实库。
