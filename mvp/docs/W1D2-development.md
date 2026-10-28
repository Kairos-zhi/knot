# KNOT-MVP-W1D2 · 本地开发记录

日期：2026-10-28。archive_id：`knot-mvp-w1d2-20261028`。
检索键：`AssetRepo`、`EventStore`、`RuleRegistry`、`session`、`commit failure`。

## 拍板后结账（覆盖下文旧时延 Gate）

用户转交的《20261028_Knot_W1D2_拍板记录与口径变更》已读取。
功能限定通过；性能按新口径（同一临时库 1000 次连续插入，P95 <10ms、
max <20ms）通过。原独立 Checker scoped 数据 P95 3.365ms、max11.967ms
满足新口径，中控另测 P95 3.671ms、max11.495ms 亦满足。
导入必须用 `repo.session()`；独立开关连接不通过，作为明确使用边界。
synchronous / WAL 不变。下文旧的严格逐次 <10ms 结论作为历史证据保留，
不再是 Day 2 未决项。

连带约定：`text/*` 且 ≤1MB 必须内嵌正文；超过 1MB 或二进制走 file_path。
该规则将在 FTS 修复卡的 API 和 docstring 中落实，并由 Day 3 导入脚本执行。
FTS 结构缺口转至 KNOT-MVP-FTS-FIX-001，修复收口前不启动 Day 3。
用户已要求 Maker 补 Day 2 本地提交；远端发布及合并仍另行处理。

补提交前独立 Gate 已复核新判定：23/23 功能测试通过；scoped 1000 次插入
median2.928 / P95 3.467 / max8.787ms，性能通过。Maker 同轮
median2.920 / P95 3.221 / max10.366ms，亦通过。此次 Gate 不含 FTS 修复。

## 既查与受理

- 用户要求「推进开发」，来源为 Week1 Day2 后端接口任务卡 v1.1。
  来源 SHA256：`5522364b9a08bde873a66b1a8d9e6f436891d821a581c926b1bc3c5d9ac1df51`。
- 基线：本地 `main` 的 `d501356`，新建 `codex/mvp-backend-interfaces`。
  开工工作树干净。
- 已读根及用户级 AGENTS、架构地图、STATE、QUEUE、README、项目工程文件地图、
  MVP README、schema 与 init_db。开发基准路径已归档，通过
  `git show f7d641a6:knot-desktop/docs/development-baseline.md` 读历史源。
- README 和文件地图确认唯一活跃代码为 `mvp/`；旧 STATE/QUEUE 为历史记录。
  本卡不恢复旧承载、不连接旧 Store、不改变 `.runtime` 或业务数据库。
- 无既有三个 Python Repo 可复用。复用冻结 schema 与 INSERT FTS trigger，
  增加一个连接/事务公共模块，避免三份连接管理。
- 数据层依据为当前 schema、Python sqlite3 和 SQLite FTS5 官方文档，
  本轮无前端改动，不作 Apple 体验验收。

## 实现及边界

已实现三类接口、共享连接模块、23 项测试、可复现性能脚本与 API 文档。
不按任务卡预估行数填充代码；共同生命周期集中在 `_db.py`。

资产/事件接口只追加；重复 hash、CHECK、FK 错误保留 SQLite 异常类型。
JSON 返回原始列字符串，明确保留 `None` 与 `[]` 差异。缺失 ID 返回 `None`。
未来事件被拒绝；规则按版本读取，失活保留原行。

每次操作默认独立连接并关闭；连续导入可用显式 `repo.session()` 复用连接，
仍每条提交，退出时在 finally 中回收连接。未修改 synchronous 或 WAL 设置。
session 不是批量原子事务，已有提交不会随之后的失败撤销。

schema 未修改，SHA256 保持
`5cd92492ff80f7ea7730d6f808d2a242212f025c455b9e29ffd63bc0d0253370`。
其资产表实际为 9 列（任务卡写 14 列），以 schema 为准。
FTS 的外部 `content` 列缺失：当前仅 MATCH+rowid JOIN 读 `assets.*` 可用，
不声称支持 snippet/highlight/rebuild。schema 本身没有禁止其他 SQL
客户端覆写资产/事件；本卡只接受接口层的只追加行为。

## Maker 自核验

已有测试环境：Python 3.11.15、pytest 9.1.1、SQLite 3.53.1；只复用
`D:/Hermes/hermes-agent/venv/Scripts/python.exe`，未安装或修改 Hermes。
系统 `python` 为 Windows Store 别名，实际测试没有使用该入口。

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
& 'D:/Hermes/hermes-agent/venv/Scripts/python.exe' -m pytest mvp/tests/test_backend.py -v --tb=short -p no:cacheprovider
& 'D:/Hermes/hermes-agent/venv/Scripts/python.exe' -m mvp.tests.benchmark_backend
git diff --check
```

测试：23 passed（2.25s），退出码 0。覆盖持久读回、FTS、重复写不覆写、
空内容、时间默认/零值/未来值、JSON空列表、SQL参数化、查询限制、种子规则、
失活、错误恢复、FK/CHECK/UNIQUE、正常和异常关闭、session逐条提交、非完整性
错误回滚，以及 COMMIT 失败后不得被下一次读操作提交。

Python 3.10 语法解析通过；实际执行为 3.11，不冒称 3.10 运行矩阵已覆盖。
未新增产品依赖。`git diff --check` 通过，无 TODO/FIXME。

性能实测（临时磁盘库，1000 资产，100 次 FTS；单位 ms）：

| 模式 | 插入 median / P95 / max | ≥10ms 次数 | 搜索 median / max |
|---|---|---|---|
| 独立开关连接 | 13.367 / 16.083 / 29.177 | 1000/1000 | 2.877 / 4.254 |
| 显式 session | 2.988 / 3.303 / 9.694 | 0/1000 | 2.818 / 4.107 |

session 总时长含开关连接为 3083.309ms。前一轮 scoped 测量 max12.427ms，
1/1000 超限；不只选取最好一轮声称严格 `<10ms` 已稳定达标。
FTS `<100ms` 目标通过，严格逐次插入目标未整体通过。

## 独立 Checker 与 Gate

独立 Checker 初轮 19/19 通过，并发现逐次插入性能未达标。
补充 session 后独立 22/22 通过；独立 scoped 插入 median3.024、P95 3.365、
max11.967ms，1/1000 超限；FTS max4.888ms。确认 WAL、synchronous=FULL，
三个 Repo 的 session 异常退出关闭，逐条提交可由另一连接读取。

Checker 另外通过 authorizer 拒绝 COMMIT 复现：旧版提交失败后残留事务，
下一次读操作会提交此前失败写入。Maker 已将 commit 纳入异常回滚范围，
新增专门回归。最终独立专项复核 23/23 通过（2.26s），再次独立拒绝 COMMIT
验证事务已回滚，之后读取不再提交失败写入。最终结论为「功能限定通过；严格
单次插入性能未通过」，无剩余功能阻断。

Gate 范围：本地接口功能限定通过；性能 Gate 保留未通过，不能自验收或标记
Day 2 完整接受。根历史状态、旧 pin 和冻结证据保持不变。

## 收口与未决

- 目标：三个 Day 3 可调用接口已落盘，导入可复用 session。
- 监听回收：只使用本聊独立 Checker，无定时件、对外消息或后台服务。
- 证据：测试、性能脚本、API 文档及本记录；临时库自动回收。
- 验收：功能限定复核，严格插入耗时仍有缺口，不等于产品接受。
- 入档：本页与 API 记录本地开发，不代表跨窗口或远端采用。
- 记录：未 commit、push、创建 PR、合并、生产安装或调用模型。
- 未决：独立开关连接时延超标，scoped 模式偶发超限；未覆盖目标机器的稳定
  性能边界。需后续性能卡或由 Holder 明确调整指标口径，不能自行改成 P95 验收。
