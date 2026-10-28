# Day 4 · schema v1.2 独立提交记录

日期：2026-10-28。卡号：KNOT-MVP-W1D4-FRONTIER17-001（第1笔）。
开工基线 main `6f763c0`，分支 `feat/knot-frontier17`。
依据已读的 event_atom 拍板记录，采用 B：独立映射表，不填充历史资产。

改动仅为 `event_atom_map`、其反向索引、1.2版本记录、显式迁移、初始化版本显示
及约束/迁移测试。映射表四列与卡一致，复合主键(event_id,atom)，FK指向
history_events.event_id，ON DELETE RESTRICT。原业务表列不改。

迁移显式指定已有候选库，BEGIN IMMEDIATE 内只CREATE IF NOT EXISTS和写首次版本，
保留1.0/1.1历史记录。有效版本只接受1.1/1.2，v1.0须先跑FTS迁移；未知/缺库拒绝。
不改FULL/WAL、不DROP、不回填、不执行实际业务库迁移。

```sh
python -m pytest mvp/tests/ -q --tb=short -p no:cacheprovider
python -m mvp.backend.migrate_schema_v1_2 /explicit/candidate.db
```

Maker全量47/47（8.61s），独立Checker全量47/47（7.68s）。AC-13/14均通过：
版本链/列类型/复合PK/FK/NOT NULL/RESTRICT；非空v1.1库迁两次，旧表定义、
业务行和版本时间不变，已有映射行在重迁后保留；中途失败完整回滚。
FULL2/WAL保持，integrity_check=ok。

独立临时非空v1.1库迁移CLI两次，均退出0：

```text
migration run 1 {"schema_version": "1.2", "backfilled": 0}
migration run 2 {"schema_version": "1.2", "backfilled": 0}
```

Gate：独立本地schema候选限定通过，无阻断。参考脚本冻结、核心和DB适配另作第2笔，
不把本Gate外推为算法验收。未推送、合并或迁真实库。
