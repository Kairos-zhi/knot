# 客户端现场文件夹组织

037直接消费036 Store-owned organization。资源库按持久folder引用顺序显示组与现场，未归组保持Workspace顺序；每现场只出现一次。组织不授予供给／读取／运行权限。原标题按钮activate、显式唤出复用同一呈现；HUD和工作岛仍共用原provider／source。

创建和改名在details整理控件内使用原生form；每现场原生select表示归属，空串是合法folder ID不可能使用的未归组sentinel，转换为folderId:null。ID取当前组织首个unused folder:<n>，改名不改变ID，名称允许重复；分组key采用folder:前缀、条目key采用site:前缀。

所有写入经原mutate保存本页dirty草稿后同批提交folder.create／rename／assign，不切换activeWorksiteId，不写供给、Agent、呈现或Run。rename到同规范title、assign到同owner直接return，避免冗余POST和预览失效；未新建业务provider；仅在现有provider增加文件夹接纳/回显与标题瞬态，既有Run源和请求生命周期保持。

客户端只接纳展示所需organization字段：version1、folders数组、id/title/worksiteIds及合法唯一归属。额外字段原样保留，不重建完整schema。初始缺组织明确“文件夹组织暂不可用”，原列表仍能切换和唤出，组织控件禁用；此前已有组织而后续响应缺失则拒绝。非法版本／引用／重复或损坏响应整体拒绝，保留last-known快照并要求刷新。

新folder命令200回执仍须在接纳JSON后确认：create/rename的folder ID及规范title，create新组无现场；assign的现场存在及目标归属。确认在清dirty草稿、清标题和emit data之前进行。标题string／rename Map仅本页瞬态，异步成功只清捕获文本，后续编辑不丢；失败保持输入，不自动重放。并发创建ID冲突先由既有revision CAS拒绝，手动刷新后再明确提交。

验证为built factory语义与隔离真实Store／重开；未证明实际ReactDOM焦点／输入法／键盘或人的体验。无生产迁移／正式候选／在用部署；036所述旧二进制／core normalizer可能丢organization的兼容边界仍适用。

无障碍名称使用文件夹／现场的人类标题；稳定ID仅留在key和data-folder-id／data-worksite-id用于身份与程序定位。同名标题不作为业务身份，也不通过向人朗读技术ID来消歧。
