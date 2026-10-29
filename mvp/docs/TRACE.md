# 候选追溯（W3D15）

```text
claim_id
  └─ user_confirm（depth=1，subject=claim_id）
       └─ evidence_refs → 事件（depth=2，继续按引用展开）
            └─ import.subject → assets 元数据
```

```sh
python -m mvp.backend.knot_query trace --db candidate/knot.db --claim <claim_id> --max-depth 5
```

起点只接受主键 claim_id，`T17-01` 等来源编号不充当主键。正常 stdout 为一行 JSON、
退出0；参数／库／候选／引用链错误为一行 `{"error": "..."}`、退出1。
`--help` 保留 argparse 帮助行为。CLI 使用仓库已有 Python 环境，模块导入路径须可用。

## 状态与输出

Python 接口为 `trace_claim(conn, claim_id, *, max_depth=5)`。调用方须已开启完整读事务，
建议使用 `with read_snapshot(db_path) as conn`；不在事务内调用会报错，防止状态和路径混用不同快照。
CLI 复用这一个 mode=ro 连接、BEGIN 与退出 ROLLBACK；函数只做 SELECT，不另开连接、不修改 row_factory，
不迁移、不缓存、不打开正文或外部对象。

函数只采样一次当前 Unix 毫秒，调用既有 `claim_support(conn, claim_id, at=...)` 取得 status，
不读取 unverified/user_response 另算判定，不复制支持算法。本卡没有历史 at 查询参数；
未来快照的解释及历史状态限制沿用 claim_support，原模块的缺陷错误也原样传播。

| 状态 | 路径与材料 |
|---|---|
| confirmed | 从唯一确认事件沿 evidence_refs 展开完整历史路径 |
| revoked | 仍展开同一历史路径；撤权不抹掉形成过程 |
| unconfirmed | path=[]、assets=[]、depth=0；candidate_sources 保留待证材料，不把它展开成确认事实 |
| 缺陷 | 缺事件、缺 import 资产、非法引用JSON、环或超深度均整次报错，不返回部分结果 |

顶层返回 claim_id、source_label、atom、status、path、assets、candidate_sources、source_members、
depth、missing_refs。candidate_sources 是候选 support_sources 的 JSON 数组值；source_members
是包内成员路径数组值，保留已有成员顺序，不解包、不从成员路径打开本地文件。两列 NULL 表示空数组。
unconfirmed 时只展示这些待证引用，不核验其目标是否存在；确认后的路径只沿确认事件实际 evidence_refs，
不以候选当前 support_sources 补链或替换它。

每个 path 元素是事件，含 event_id、event_type、subject、event_time、recorded_at、evidence_refs（数组）、depth。
共享事件只出现一次，depth 为离根最近的层数；顶层 depth 是整条有向无环图最长引用链的层数，
两者在共享节点图上可能不同。确认根为1、直接证据的最近层为2。
assets 从路径中的 import.subject 反查，按 asset_id 升序去重，返回 asset_id、content_hash、media_type、
source_uri 与 metadata_json.path（无 path 时为 null）；不返回 blob、file_path 正文或其它元数据字段。

## 排序与两种时间

**path 一律按 event_time 升序、同刻按数据库 rowid 升序**。确认事件是逻辑根，未承诺占数组首位。
import.event_time 来自来源文件 mtime；recorded_at 是其入库时刻。确认事件 event_time 来自 review_claim
的确认时刻。它们并非统一的逻辑时钟，不能把 event_time 当因果顺序。

例如独立测试中确认时间50、材料 mtime=100，确认根会排在材料之前；材料 recorded_at 仍是实际录入时间。
通常材料更早、确认更晚时则根排在最后。两种情况均保留原始双时间戳，不为展示改排序键或伪造源时间。
时间示例和真实语料候选副本的演练不是生产确认记录。

## 严格失败与深度

max_depth 是正整数（拒绝 bool），默认5，根已占一层。6层链在5时报错、6时通过。
检查所有引用路径的最长深度，共享节点的短路径不能隐藏较长路径的超限。
迭代遍历检测正在访问的祖先，报错列出环上的事件ID；共享后继不误报为环。
缺失事件错误点名 event_id，缺失资产错误点名 asset_id 与 import 事件。

本卡只有严格模式，没有 strict=False；成功结果 missing_refs 固定为空数组。
任何错误在完整输出生成前抛出，不会出现看似成功的半截路径。

实现与测试见 [traceback.py](../backend/traceback.py)、[test_traceback.py](../tests/test_traceback.py)，
断言映射见 [W3D15](claim-map/W3D15.md)。真实语料两个锚点仅证明链条读回，不等于
10个核心决策的抽样准确率≥90%已验收；后者仍须单独抽样和人工核对原文及event_id。
