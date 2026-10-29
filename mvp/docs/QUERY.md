# 查询入口（W2D9 · 2a）

本次基于 `main@651bac3` 实现 `timeline_query.py` 与三个 CLI 子命令。
2b 的 support 子命令待 W2D10 合入后在同一分支追加；2a 没有占位命令。
Maker 自测与独立技术复核不代替小禾复核和之的 Gate，不代表合并或产品接受。

```sh
python -m mvp.backend.knot_query events --db candidate/knot.db --start 0 --end 9999999999999 --limit 200
python -m mvp.backend.knot_query asset --db candidate/knot.db --hash <sha256>
python -m mvp.backend.knot_query claims --db candidate/knot.db --atom decision --limit 500
```

在仓库根使用已有 Python 开发环境运行；CLI 不是已安装的系统命令。
从其它目录调用须配置模块导入路径，并显式指定数据库路径。
成功 stdout 一行 JSON（事件／候选为数组，资产为对象或 null），退出 0。
参数及数据库错误输出一行 `{"error": "..."}`，退出 1；未知子命令退出 2，
同样输出一行错误 JSON。`--help` 沿用 argparse 帮助，不属于查询结果。

## Python 查询与所有权

```python
from mvp.backend.timeline_query import read_snapshot, events_range, asset_by_hash, claims_by_atom

with read_snapshot(db_path) as conn:
    events = events_range(conn, start=0, end=1000, limit=200)
    asset = asset_by_hash(conn, content_hash)
    claims = claims_by_atom(conn, "decision", limit=500)
```

| 入口 | 连接模式 | 谁 BEGIN | 谁 COMMIT／ROLLBACK | 关闭 | 一致性边界 |
|---|---|---|---|---|---|
| `read_snapshot` | `mode=ro` | 入口自己 | 退出时 ROLLBACK | 入口自己 | 整个 with 块，含 schema 检查 |
| `events_range` / `asset_by_hash` / `claims_by_atom` | — | 调用方 | 调用方 | 调用方 | 只读给定 conn |
| `knot_query` 的 events／asset／claims | `mode=ro` | `read_snapshot` | 退出时 ROLLBACK | `read_snapshot` | 单次子命令 |

只读入口不得隐式建库、迁移或修复索引。查询函数不得内部新开连接。
不得把多个连接的读拼成一次查询。调用方须保持事务完整，不在 with 块内自行
COMMIT／ROLLBACK 后继续读取；否则已越过上述一致性边界。

`read_snapshot` 要求 schema 1.4 标记及来源两列存在；缺库、目录、旧库和损坏库报错。
检查仅做 SELECT，不构成完整 schema 漂移体检，不调用迁移器。
SQLite 在事务第一次读取时固定快照；本入口在 BEGIN 后立即读取 schema，
随后调用方的所有查询共享该快照。正常和异常退出均回滚并关闭。

`events_range` 采用 Unix 毫秒半开区间 `[start,end)`，按 `event_time,rowid` 升序。
同刻事件按插入 rowid 稳定排序。start/end 必须是整数（不接受 bool）。
空区间返回 `[]`，逆向区间抛 ValueError；此处遵循任务卡 AC-1，
与卡内 D1 的 `end <= start` 报错要求存在冲突，待复核确认。
limit 复用 `_db.validate_limit`：非负整数、拒绝 bool，0 返回空，默认 200。

`asset_by_hash` 精确匹配 content_hash，返回完整数据库行或 None。
不打开 file_path 指向的对象；Python 函数按 AC-3 保留 content_blob 的 bytes/None，
此返回值不承诺直接可 JSON 序列化。CLI 按 D7 的元数据边界省略 content_blob，
其余列原样返回；不解码、编码或输出内嵌正文。这是卡内完整行与元数据要求的
分层处理，交小禾复核。正文读取与授权留后续资产接口。

`claims_by_atom` 精确匹配 atom，按 source_label、rowid 升序，默认 limit=500。
返回 claim_id、claim_type、atom、source_label、support_sources、source_members、
unverified、user_response。JSON 列保留数据库字符串，NULL 保留 None；
未知 atom 返回 `[]`，非字符串／空串报 ValueError。

## 时间源与验证边界

event_time 是导入来源文件 mtime 的毫秒值；recorded_at 是事件写入时间。
本轮独立候选库实跑确认 22 个 import 事件的 event_time 落在
`[1793126938943,1793126938991]`，跨度 48ms，与任务卡历史实测一致。
打包时间不能表示某轮研究的语义期间，本入口不推断该语义。

底层测试使用分散时间事件覆盖边界及排序，并使用 WAL 双连接屏障：
读方读 22 条，另一连接以 timeout=0 插入并提交，旧读事务仍读 22 条，
退出回滚后新事务读 23 条。没有 sleep 或墙钟断言。
此处遵循 S1／D4 的唯一所有者退出 ROLLBACK；AC-5 第④步写 COMMIT，
与上述所有权契约不一致，测试没有让调用方提前 COMMIT。两者均结束只读事务，
本实现固定采用 ROLLBACK，此项冲突连同空区间语义交小禾确认。
三个 CLI 子命令分别 monkeypatch sqlite3.connect 计数，均为一次；
正常返回后连接已关闭，stdout 均是一行可解析 JSON。

本轮从保留的历史导入库经 SQLite backup 创建独立候选副本，显式升级副本后运行
既有抽取器，得到 110 个候选；没有迁移或修改来源库，来源库文件哈希保持不变。
三个 CLI 在此真实语料副本上读回：22 条 import、按 hash 命中资产元数据、
decision 47 条且 source_label 升序；另核 conditional_theorem 22 条。
未执行真实业务确认，也不据候选数量推断其成立。

可复核测试见 [test_timeline_query.py](../tests/test_timeline_query.py)；运行命令：

```sh
python -m pytest mvp/tests/test_timeline_query.py -q -s
python -m pytest mvp/tests/ -q -ra
```

本机完整命令、原始 JSON 与测试输出保留在忽略目录
`evidence/local/20261029-w2d9-query-maker/`，评审摘要和远端 CI 在本卡 PR 中附录；
这些本机产物不作为仓库内可下载附件。全量结果以 PR 本次实跑为准。
