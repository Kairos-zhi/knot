# KONT-WORKSTATION-036 · 现场文件夹组织契约

2026-10-26；Maker候选，独立Checker／根Gate另记。archive_id=`kont-worksite-folders-20261026`；检索键：W5、G3、文件夹、organization、同内核。

目标：先提供可读、可调用、可订阅并能恢复的现场文件夹组织契约，再接UI。组织只引用现场，不复制资产／Worksite／Run，不是完整Project或权限组。

既查：上下AGENTS、development-baseline、STATE/QUEUE、035独立回执；锁定roadmap／development-plan／design-principles；原包product/overview、interaction和architecture/state-and-persistence（原包根C:/Users/x2270/Documents/Codex/2026-10-17/knot-accepted-core-publish）。现frozen Workspace严格只有active/worksites/presentations；Project尚未表达。故不改vendor、不借asset／chain_id／供给边伪装文件夹，采用同KontStore顶层owned organization扩展。

后端复用已审RESEARCH-002同控制面／owner／CAS原则和当前applyCommand→Store提交队列／revision／seq／事件；无新transport／权限。前端未来沿Apple文件夹组织语义，本卡无文件夹UI或正式Project体验接受。

契约：organization={version:1,folders:[{id,title,worksiteIds:[]}]}，flat最多200组，总现场引用最多200，每现场至多一组。folder.create显式必填id；folder.rename(folderId,title)；folder.assign(worksiteId,folderId:string|null)原子移动／移出。新folder.id非空、最长200、字面值保留；title原输入最长200、去空后非空；已有worksiteId引用不新增长度限制。严格字段／版本／重复ID／组内或跨组重复／不存在引用与非JSON结构拒绝。既有Agent命令可带baseSeq。

Store显式保全organization，schema4核心／frozen normalizer不变；缺organization的旧数据读取为空且不主动改磁盘。显式undefined／null等非法。snapshot导出带组织；restore同步复制入队前内容，writer queue内按当时组织检查：当前存在任何folder（包括空folder）时，缺organization拒绝ORGANIZATION_RESTORE_REQUIRED；显式有效empty可有意替换。Run restore guard原样保持。

允许域：src/kernel.mjs、src/store.mjs、新tests/worksite-folders.test.mjs、tests/folder-protocol.test.mjs、本卡和docs/api/worksite-folders.md，本地evidence/local/20261026-worksite-folders/maker。先写TASK拟契约再实现，制作前63路径完整hash及kernel/store原始hash已保存。未改index/client/vendor/build/现26清单/旧证据/根状态；build生成bundle与原hash一致。

自核验：build0，7个明确专项入口42/42（本卡10、相关32），git diff --check0；baseline63除STATE/QUEUE/store外60路径全部字节保持。真实临时Store＋HTTP对照人／Agent创建改名移动／移出、revision/baseSeq、认证／Origin、失败批次／事件、零供给／权限效果、导出恢复／入队冻结／缺组织队列guard／旧数据不写迁移／长历史ID／重开／Run guard。无截图或模拟点击。

边界：无新增模型、生产profile／用户数据／凭据／私人Session、系统启停安装、branch stage commit PR push merge／正式候选。没有文件夹UI／完整Project／细粒度授权／真实宿主或人的体验接受；G3/G4/G5仍未完成。032旧提交清单仍须重审。

七格：目标为组织契约；监听回收沿现Store事件无新增监听机制；证据见manifest／日志；验收待独立Checker／Gate，不自验收；入档本卡和本地证据；记录为本地候选；未决为UI接入／宿主／人验及其余W5范围。
