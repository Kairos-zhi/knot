# Day 5 · carry-forward 第1笔提交记录

日期：2026-10-28。卡号：KNOT-MVP-W1D5-SUPPORT-001。
开工基线main `f23855f3beeb08fee0e91790c7e83ba58f8dc19e`（PR #23），
分支 `feat/knot-support-view`。用户授权开工；任务卡、快照/支持族定义、
适配代码及原Day 4测试已查。开工前已有未跟踪 `mvp/backend/__pycache__/`，
保留、不纳入提交，不清理历史运行产物。

原 `_eligible` 为精确时刻查询，现以公开 `eligible_at(conn,T)` 替换：
每事件取时间≤T的最后状态，同刻按rowid最大兜底；注释明确未来唯一约束另卡。
load_state/evaluate_from_db/incremental_from_db（包括旧快照）全部使用它。
不改内核、schema、冻结副本，不写库，不添加缓存。

Day 4 原有断言未放宽；增加2个测试，覆盖无记录时延续、撤权保持、显式恢复、
过去时间不读未来值、同刻后写胜。API将原精确匹配说明更新为carry-forward。
此变更覆盖历史Day 4文档的点快照口径，不改写其旧验证记录。

独立临时库分三阶段执行：AC-1仅写入t10可信行并查询；AC-2再追加t20撤权行；
AC-3再追加t40恢复行。下列输出按当时已写入的状态行读取，不是全部写完后回放。
实际point vs carry输出：

```text
AC-1 T=10: point=['ex']; carry=['ex']
AC-1 T=20: point=[]; carry=['ex']
AC-2 T=30: point=[]; carry=[]
AC-2 T=35: point=[]; carry=[]
AC-3 T=35: point=[]; carry=[]
AC-3 T=40: point=['ex']; carry=['ex']
AC-3 T=50: point=[]; carry=['ex']
```

Maker原Day 4加2项专项9/9通过（12.84s）。独立Checker原全量加2项56/56通过
（28.86s，无墙钟门），自有临时库验证上述状态、SELECT-only/total_changes不变、
old_snapshot_time=15无精确行的增量与全算相等。另核较晚插入的t10行不能
覆盖t40状态，只有同刻才按rowid兜底。core/schema/两个fixture与main未改。

```sh
python -m pytest mvp/tests/ --ignore=mvp/tests/test_support.py -q -p no:cacheprovider
git diff f23855f -- mvp/backend/frontier17.py mvp/backend/schema_v1.sql mvp/tests/fixtures/
```

第二笔compute_support及其测试独立审阅，不把本Gate扩成支持族验收。
本地carry-forward候选及文档已获独立限定Gate，无剩余阻断。
不推送、不合并、不迁真实库。
