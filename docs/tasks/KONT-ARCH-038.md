# KONT-ARCH-038 · 完整Store业务快照与读取

2026-10-26；Maker候选，独立Checker／根Gate另记。archive_id=`kont-arch-state-20261026`；检索键：ARCH-01、Store快照、titles、人Agent同义读。

目标：收口历史ARCH-01，不让现场名称在持久状态／导出恢复／Agent读取之间丢失。由现KontStore明确完整业务快照与Canvas核心投影，保全titles和organization；不把renderer名称回退当修复。

既查：上下AGENTS、开发基准、当前STATE/QUEUE、evidence/local/20261026-architecture-history-checker/REPORT.md及findings.json的ARCH-01；沿原路线及033–037既有上下文。原73路径完整baseline和具体预核方案在evidence/local/20261026-arch-state/maker。根批准、原Checker设计预核后实施；预核不是工程接受。

契约：snapshot()是flat `format:kont-store-snapshot/v1`完整业务导出，包含schemaVersion4核心、titles、organization、显式runs；live revision/seq属于目标Store，不采用源计数。coreSnapshot()仅为frozen Canvas核心投影，明确不能代替完整备份。read()仍原live状态，现GET /kont/snapshot无需改index即向同一授权范围的人／Agent提供相同完整导出；元数据与workspace读同义。

full marker在restore和磁盘init均先识别，未来／错类型拒绝；full必须core字段、titles全覆盖、organization与runs齐全，不靠core缺省。full Run journal仍须在writer queue与目标journal完全一致，不允许外部Run迁移。未标识旧metadata输入保留显式有效titles；显式partial／坏值拒绝。旧输入缺titles仅在目标无非默认业务名称时允许明确默认迁移，执行态有非默认名拒绝TITLES_RESTORE_REQUIRED。缺organization沿036执行态guard；显式empty含义保持。旧磁盘init仅补真正缺失title项，保留已有名称且不立即写回；显式坏表拒绝。

实施仅store.mjs局部具名函数／方法，不改kernel/index/vendor/runtime模块／26清单。两旧fixture适配均经根明确批准：run-dispatch omitted journal场景删format表明legacy；worksite-folders queued missing organization场景删format仍测原执行态guard。原断言保留，full缺元数据早拒由新测试补；未放宽018预检。

自核验：build0；10个明确专项入口61/61（本卡9）；git diff --check0。实际临时Store、多命名现场／folder／synthetic Run完整往返与重开，人Agent实际loopbackHTTP同义读取，core/full区别、完整性／未知版本／显式坏metadata、legacy迁移与执行态保护、入队前捕获／输出别名、Run owner／CAS边界。原73除允许修改及控制文档后的69路径全保持；clean旧run-dispatch原HEAD/当前hash和精确diff另存。

边界：本卡不解决DEBT-01旧reader／降级迁移或DEBT-02正式发布，不改018正确拒绝门；不声称跨Store Run journal迁移、原生宿主／人的体验、强杀断电或G3/G4/G5已完成。无模型／生产profile用户数据凭据Session／系统软件启停安装／branch stage commit PR push merge或正式root候选。

七格：目标为ARCH-01契约闭合；监听回收沿现事务事件；证据见Maker manifest／日志；验收待独立Checker／根Gate，不自验收；入档本卡与本地证据；记录本地候选；未决为其余ARCH冲突及旧reader／发布债。
