# Knot MVP

**状态**：Week 1 Day 4 已随 PR #23 合入 main；Day 5 两笔候选已获独立本地Gate。
FTS 1.1 已合入 main；Day 3 候选导入已完成 22 资产 / 19 全文索引 / 3 对象。
Day 5 延续状态与支持族均已实现，不改内核、schema或冻结参考。

接口用法见 [API](docs/API.md)，本轮证据与未决项见
[Day 2 开发记录](docs/W1D2-development.md)。
FTS 迁移、AC 与复核见 [FTS 修复记录](docs/FTS-FIX-001.md)。
Day 3 来源完整性、候选库与验收见 [导入记录](docs/W1D3-IMPORT-001.md)。
Day 4 模型计数、差分和只读适配见 [Frontier17 记录](docs/W1D4-FRONTIER17-001.md)。
Day 5 两笔提交与支持族证据见 [支持族记录](docs/W1D5-SUPPORT-001.md)。

基于 v0.5 产品方向 + v0.4 第十七轮算法验证的最小可用原型。

---

## 快速开始

### 1. 初始化数据库

```bash
cd mvp/backend
python init_db.py ~/.knot/knot.db
```

输出示例：

```
✅ 数据库初始化成功
   版本: 1.2
   时间: 2026-10-28 01:xx:xx
   说明: Event to atom mapping, without historical backfill
   表数: 14
      - assets
      - claims_candidates
      - continuation_bundles
      - eligible_snapshots
      - history_events
      - horn_rules
      - schema_version
      - event_atom_map
      - assets_fts
      - assets_fts_config
      - assets_fts_content
      - assets_fts_data
      - assets_fts_docsize
      - assets_fts_idx
```

### 2. 验证 Schema

```bash
sqlite3 ~/.knot/knot.db ".schema assets"
```

---

## 目录结构

```
mvp/
├── backend/               # Python 后端
│   ├── schema_v1.sql      # SQLite schema
│   ├── init_db.py         # 数据库初始化脚本
│   ├── asset_repo.py      # AssetRepo 接口
│   ├── event_store.py     # EventStore 接口
│   ├── rule_registry.py   # RuleRegistry 接口
│   ├── _db.py            # 连接、事务与显式 session 作用域
│   ├── frontier17.py      # 语义冻结的纯函数内核
│   ├── frontier17_db.py   # SELECT-only 数据适配
│   ├── support_view.py    # carry-forward支持族的稳定JSON投影
│   ├── migrate_schema_v1_2.py # 只增量创建映射表
│   └── import_baseline.py # 显式候选库导入与幂等重跑
├── frontend/              # React 前端
│   └── src/
│       ├── App.tsx        # （待实现）
│       ├── routes/        # 路由页面
│       └── components/    # 可复用组件
├── tests/                 # 测试
│   ├── test_backend.py    # 后端接口与数据库约束回归
│   ├── test_import.py     # 导入、事件成对提交、源完整性
│   ├── benchmark_backend.py # 临时磁盘库性能测量
│   └── test_frontier17.py # 22,391 组＋差分及数据库适配
└── docs/                  # 文档
    ├── SCHEMA.md          # Schema 设计文档（待编写）
    └── ROADMAP.md         # 四周 Roadmap（已完成）
```

---

## 数据模型（v1.2）

### 核心表（8 张）

1. **`assets`**：资产表（I-01 只追加）
2. **`history_events`**：历史事件表（I-01 只追加）
3. **`horn_rules`**：Horn 规则表（固定正向）
4. **`eligible_snapshots`**：信任快照表
5. **`claims_candidates`**：候选关系表（I-02 非事实）
6. **`continuation_bundles`**：续接包表
7. **`schema_version`**：Schema 版本记录
8. **`event_atom_map`**：事件主张的原子映射（不回填旧资产）

### 索引与约束

- FTS5 全文索引：`assets_fts`
- 外键约束：`eligible_snapshots.event_id → history_events.event_id`
- 时间约束：`recorded_at >= event_time`
- 内容约束：`content_blob IS NOT NULL OR file_path IS NOT NULL`

---

## 技术栈

- **后端**：Python 3.10+ / SQLite 3.40+ / 标准库（无 ORM）
- **前端**：React 18 / TypeScript / Vite / Radix UI / Tailwind
- **算法**：Frontier17（第十七轮验证通过）
- **测试**：pytest（后端） / Vitest（前端）

---

## 开发状态

### Week 1: S1 导入与指纹 + CI 基建

- [x] Day 1: SQLite schema + 初始化脚本
- [x] Day 2: AssetRepo / EventStore / RuleRegistry（连续导入须用 session）
- [x] Day 3: 候选导入 22 个文件，已随 PR #22 合入 main（6f763c0）
- [x] Day 4-5: Day 4 已合入 main，Day 5 两笔本地Gate通过（未推送/合并）
- [ ] Day 6-7: CI 上线

---

## 约束与红线

### 不变量（I）

- **I-01**：历史不覆写（`assets` / `history_events` 只追加）
- **I-02**：声明与事实分离（`ClaimOrCandidate` ≠ 用户确认）
- **I-05**：授权视图分层（布尔 / 来源 / 正文分开）

### 开放问题（Q）

- **Q18**：动态查询缺依赖证书 → 全量重算（不冒险复用）

### 红线

1. ❌ 不得覆写 `assets` / `history_events` 已有行
2. ❌ 不得把 `ClaimOrCandidate` 自动升级为 `user_confirm` 事件
3. ❌ 不得在授权检查前缓存并外发 `support_view`
4. ❌ 不得跳过 Frontier17 算法验证（22,391 assertions）

---

## 参考资料

- [Roadmap](../docs/20261028_Knot_前后端Roadmap_写死版_v1.0.md)
- [v0.5 产品方向](D:\Hermes\cache\scratch\knot_research_v05\Knot_研究_产品落地写回_v0.5_20261027\)
- [v0.4 数学研究](D:\Hermes\cache\scratch\knot_v04_baseline\Knot_数学内核研究_移交_v0.4_20261027\)
- [第十七轮算法](D:\Hermes\cache\scratch\knot_v04_baseline\...\Knot_第十七轮_跨层增量可复现验证_20261027.py)

---

## License

与主仓库一致。

---

**更新时间**：2026-10-28（Day 2 本地交付；未远端发布）
