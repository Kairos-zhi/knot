# 离线完整 Store / reader 配对预检

`probeStoreReaderPairing(inputBytes)` 从 scripts/store-reader-pairing.mjs 导出，仅接受恰好一个非空、至多8MiB的 Buffer，入口即复制。无CLI、文件路径、reader、callback、能力报告或授权参数。它不读取生产数据、不调用旧018生产入口、不创建正式候选，也不运行写业务命令。

固定执行两份 reader：当前受审7文件闭包与017恢复候选硬pin manifest中的6文件闭包。实际字节校验后复制到独占临时目录；worker只加载该副本固定Store入口。脚本、worker、每份闭包及017 manifest摘要进入结果。相同schema号不表示相同reader；当前闭包源码或构建字节漂移会拒绝，需另经审查更新pin。

完整v1原字节直接写临时盘，不添加revision/seq字段。每份reader实际init→read→snapshot→close。read期望为原full去format、添加本地revision/seq=0，其余字段完全比较；snapshot必须与原full全语义等值。读取/关闭后磁盘字节也必须不变。没有忽略titles/org/journal、默认名替换、摘要重算或自动迁移。

返回 `pairCompatible`、`readExportOnly:true`、`productionDeploymentAccepted:false`、`sourceSha256`（输入合法Buffer时）、`execution`（可捕获时）、`readers`、`failures`。reader包含固定ID、闭包hash/各文件hash、manifest hash、`readCode`/`exportCode`及失败码；不返回正文、业务ID、异常message/stack、stderr或本机数据路径。

| 结果 | 含义 |
|---|---|
| PRESERVED | 该读取或导出与明确期望全语义相同 |
| LOSSY_READ / LOSSY_EXPORT | reader执行了，但丢字段或改值 |
| READER_REJECTED | 具体Store validator拒绝输入；不代表基础执行故障 |
| NOT_RUN | 该环节未完成或未执行 |

当前真实validator拒绝才归INVALID_FULL_SNAPSHOT；JSON/完整marker错误也属源无效。当前read/export不等为CURRENT_READER_LOSSY，不能把规范化差异忽略。pin/manifest/load/worker/临时执行故障属于基础失败，不能误报源坏或旧reader拒绝。当前失败或有损时不继续旧reader。两份reader都保全、字节不变且没有基础/关闭/清理失败，pairCompatible才为true。

超时5秒终止本次owned Node子进程并等close，再处理临时副本。close失败或init资源释放不明时保留诊断目录，记录CLEANUP_WITHHELD；timeout、CLOSE_FAILED、CLEANUP_FAILED各自保留，不能被后续清理成功洗掉。结果不泄露保留目录路径。

当前固定017对带组织的合法短Run完整状态可读但有损；对合法长Core引用Run会拒绝。固定组合因此不能作为完整Store升级/恢复配对。该预检只证明具体字节reader的读/导出能力，没有writer往返、生产迁移/恢复、模型、安装或发布许可。旧018保持原用途与拒绝边界。
