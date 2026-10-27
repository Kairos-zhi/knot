# KONT-ARCH-042 · Core 业务引用域

状态：MAKER_CANDIDATE，待独立 Checker 与根 Gate。2026-10-26。

ARCH-05 反例为 Core 合法长 agentId 可持久化/预览却无法 prepare。run.mjs 原统一 identity<=200 把业务引用错误归入 Run 身份域。本卡复用 Core 非空 opaque 语义，仅在既有 Run 模块拆窄谓词；材料/块/provenance 仍委托原 normalizer，没有第二模型。

产品仅 packages/dsh-plugin/src/run.mjs；新增 tests/run-reference-domains.test.mjs 和 docs/api/run-reference-domains.md。未改 store/kernel/read/config/guard/query/view/helper/runtime inventory、版本或历史记录；未削改旧测试。

自核验：single build 成功；14个 focused 文件80项通过，其中本卡5项，包含038–041回归与关键 Run、guard、read/config。验证临时 Store 的精确长引用、预览无别名、prepare/query/view、synthetic return 与重复回流、重开持久化、目标变化CAS与失败原子性、受限身份与安全地址负例。

另用只读 HEAD 原 run.mjs 构造旧实现 synthetic completed journal（含claim/receipt），现实现 validation/hash一致，两次当前 Store read/close 不改文件字节。证据为本卡 maker/old-run-fixed.json、old-reader-result.json；没有改写旧证据或将新长引用塞进旧记录重算摘要。

长 Worksite 仅证明 full snapshot+显式短标题的合法既有态。普通create默认标题限制仍在；长引用不意味实际 Agent 解析、对话/Session读取授权；旧 reader/迁移/降级兼容未外推。没有模型、生产、私人 Session、系统启停安装或 Git mutation。

完整基线、设计、测试日志、保护比对与冻结清单在 evidence/local/20261026-arch-identities/maker。Maker候选不能自验收。
