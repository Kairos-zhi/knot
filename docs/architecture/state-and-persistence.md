# 状态、身份与保存恢复

更新：2026-10-18。下面区分当前真实字段与产品后续增量，不把完整目标 schema 冒充现有实现。

## 当前模型

| 对象 | 真实字段／内容 | 说明 |
|---|---|---|
| KnotNode | id、type、title／summary／token／src／chain_id、可选 blocks、位置 | 资产内容仍在 WorkflowDocument |
| KnotBlock | id、source、timestamp、provenance、content | 有序块与历史来源；兼容旧 title／summary |
| KnotEdge | 两端节点与端口、data／fixed | 序列化保留固定关系及合法扩展数据 |
| WorksiteState | id、assetId、conversationId、draft、agentId、checkedIds、excludedIds | 一个现场的可编辑输入状态 |
| PresentationState | id、worksiteId、kind、closed、layout | kind 为 window／card／icon；是引用，不复制现场 |
| WorkspaceState | activeWorksiteId、worksites、presentations | 单一 Workspace，兼容保留 legacy 现场 |

不同现场隔离供给与草稿；同一现场的多个实例共享状态。关闭实例不删除现场或资产。资产与对话关联只表示身份，不自动授权读取。

Project、意图、预期产物、块级选择、选定版本／哈希、原生宿主、widget、Run／外部 Session 映射和来源 connector 都属于后续产品增量，当前类型不能完整表达它们。

## 可见集与输入

`KnotSelectionService` 持有唯一 Workspace。旧 toggle／getCheckedIds 兼容入口绑定 legacy 现场，不能用它代替指定新现场的输入。

`compileWorksiteInput(worksiteId)` 只读取该现场 checked 且未 excluded 的真实资产，保留块与元数据，返回脱离现场的副本。它不递归读取 provenance 父项，不从其他现场兜底，不调用模型或发网络请求。

恢复、导入、回滚未完成或状态被隔离时拒绝读取；事务边界测试覆盖这些观察窗口。查看、展开、视觉选中和固定不增加供给。人工排除只有明确重新连接才解除。

## 快照版本与存储键

客户端完整快照包含 `assets`、`edges`、`schemaVersion: 4` 和 `workspace`。规范化兼容未声明版本／schema 3 的旧数据，为其建立默认现场；不支持的版本和非法引用返回明确错误。

**localStorage 键仍是 `knot:canvas:v3`，没有改名。** 存储键和快照 schema 是两个不同概念，不能因为值采用 schema 4 就把键写成 v4。

`SnapshotStorage` 的契约是单值替换成功，或失败时保留原值。测试有独立 UTF-8 文件适配器；这不等于浏览器 localStorage 自身获得了跨进程文件事务能力。

## 恢复链

1. 完整读取与预校验输入，拒绝 accessor、非法结构、重复 ID、引擎保留 ID、边／资产冲突和缺失引用。
2. 建立恢复事务，应用资产／边与 Workspace。
3. 检测不完整导入；失败时恢复先前状态。
4. 检查回滚是否真的完整；回滚失败则隔离不健康状态，阻止继续保存／编译。
5. 明确有效恢复后解除隔离。订阅者异常不能抹掉已经完成的事实或污染后续观察者。

Watcher 对健康状态进行去抖保存，清理时取消定时器／订阅，必要时 flush。启动恢复按 owner 管理；失败不会消费重试机会，损坏存储字节保留，不被静默覆盖。

## 本地持久化与远端写回不是同一能力

`pushSnapshotToAssetFile` 当前只发送 `assets` 和 `edges`，不发送完整 `workspace`。HTTP `/snapshot` 也不能据此当作新的远端现场存储出口。因此：

- 完整现场保存恢复有本地构造／服务层证据。
- 当前远端兼容写回不证明 Workspace 已同步。
- 需要跨宿主现场同步时，应补版本化契约、权限、冲突与恢复测试，不能直接扩大发送范围。

## 证据与后续

T1–T9 覆盖现场隔离、共享呈现、查看不授权、断开、三态、实际存储恢复、旧数据、双调用方和负向数据。恢复／事件与生命周期有额外测试。具体入口见[验收与验证](../development/acceptance.md)。

保存本地状态不能证明已托管 Run 跨进程恢复、模型历史安全缩减或跨设备同步。上述能力须经运行／来源适配另行交付。
