# 完整Store业务快照 v1 与Canvas投影

完整业务状态仍由单一KontStore持有。`schemaVersion:4`只说明Canvas核心，不表示完整Store导出或旧reader兼容。

| 入口 | 契约 |
|---|---|
| Store.read()／现workspace GET | live状态：核心、titles、organization、已有runs、本地revision/seq |
| Store.snapshot()／现GET /kont/snapshot | 完整业务导出：format=kont-store-snapshot/v1、schemaVersion4、assets、edges、workspace、titles、organization、runs；没有Run时runs=[] |
| Store.coreSnapshot() | 仅schemaVersion/assets/edges/workspace；不含业务名称／组织／Run／format，不能当完整备份 |

GET /kont/snapshot保持既有{ok,seq,snapshot}外层、路由与认证／Host-Origin边界；现人和Agent在同一授权读取范围内读同一snapshot。完整元数据与live workspace同义，差异是导出format和本地计数。没有新增权限、来源读取或列级脱敏承诺。`/kont/runs`仍是原窄Run投影，不受完整导出替代。

```json
{
  "format": "kont-store-snapshot/v1",
  "schemaVersion": 4,
  "assets": [],
  "edges": [],
  "workspace": {"activeWorksiteId":"legacy","worksites":[{"id":"legacy","assetId":null,"conversationId":null,"draft":"","agentId":null,"checkedIds":[],"excludedIds":[]}],"presentations":[]},
  "titles": {"legacy":"第一个工作现场"},
  "organization": {"version":1,"folders":[]},
  "runs": []
}
```

完整v1是明确、封闭的已知字段契约。未知format／未来版本／错误marker类型拒绝UNSUPPORTED_STORE_SNAPSHOT_FORMAT；未知顶层字段或缺／坏core字段拒绝INVALID_STORE_SNAPSHOT，不让core normalizer静默丢未来业务扩展。schemaVersion/assets/edges/workspace必须显式存在且满足核心类型；titles、organization、runs同样必有。磁盘init若看见marker，也按full完整度检查，不能借legacy启动规则补缺。

titles为普通JSON record、键非空、值string且最长200；每个导入worksite须有自己的名称。名称不trim、不按ID重建；合法额外名称条目保持。accessor／symbol／错误类型拒绝；已有长worksite ID不套新folder ID长度限制。organization沿036严格引用规则；runs沿现validateRuns。底层core的普通数据检查可先报INVALID_SNAPSHOT，不能绕过它读取accessor。

恢复仍为Store.restoreSnapshot，未新增HTTP恢复transport。full v1缺titles／organization／runs分别拒绝TITLES_RESTORE_REQUIRED／ORGANIZATION_RESTORE_REQUIRED／RUN_RESTORE_CONFLICT；显式坏值不能当缺失。输入在入队前规范化复制，writer queue检查目标revision CAS及Run journal等值；目标本地revision／seq随原事务推进，不恢复源计数。

Run attestations不是可迁移外部权威：full的显式runs必须与writer执行态目标journal完全一致。不能将有Run导出恢复进空Run owner，不能借缺字段擦掉journal。目标journal保持原记录，完整导出往返只证明同一owner的已知状态保全。

未标识输入按legacy处理：显式titles必须有效且全覆盖，显式organization严格验证，提供runs须与目标journal匹配；缺runs沿历史契约保留目标journal。缺organization而目标有任意folder（含空folder）在writer执行态拒绝。缺titles而目标存在非默认业务名也在执行态拒绝，不能让旧core输入把人类名称擦成ID。仅目标全为可解释默认名时允许旧输入默认迁移；legacy默认为“第一个工作现场”或其id字面值，其余为id字面值。已有默认名称精确保留，新缺项使用对应默认；显式有效empty组织仍表示有意替换。

旧磁盘启动是单独的legacy兼容：缺表／partial表只补真正缺失名称，已有值保留，显式坏titles拒绝；读取／关闭不主动重写。它不能用来放宽restore的显式titles完整度，也不能对有full marker文件补业务字段。

旧二进制和单独normalizeCanvasSnapshot可能丢titles／organization等扩展，不能直接作为无损迁移／降级工具；完整format标识不是旧reader支持证明。018旧配对预检仍可正确拒绝新状态，本卡未放宽它；DEBT-01／DEBT-02、正式候选／生产迁移未解决或执行。
