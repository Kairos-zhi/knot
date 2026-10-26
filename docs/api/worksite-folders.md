# 现场文件夹组织 v1

organization由现KontStore在schema4核心之外持有。它只组织现场引用，不授予查看、供给或Agent运行权限，不改变目标、草稿、选材、Agent、呈现、资产或Run归属。

```json
{"organization":{"version":1,"folders":[{"id":"research","title":"研究","worksiteIds":["legacy"]}]}}
```

数据规则：flat无嵌套／删除，最多200个folder与200个总引用；每个worksiteId必须已存在、全组织至多出现一次。folder必须且只含id/title/worksiteIds；organization必须且只含version/folders。id是非空字符串最长200，title原输入最长200且去首尾空白后非空。title规范化，id字面值保留；已有Worksite的长ID仍可引用。数据必须普通JSON；版本／额外字段／accessor／数组额外属性／稀疏数组／重复或缺失引用均拒绝INVALID_ORGANIZATION。

| 操作 | 字段 | 成功值／事件 |
|---|---|---|
| folder.create | id必填、title | id／folder.created |
| folder.rename | folderId、title | id／folder.renamed |
| folder.assign | worksiteId、folderId为已有id或null | {worksiteId,folderId}／folder.assigned |

create不自动生成id；同类重复id拒绝DUPLICATE_ID。assign原子移出旧组再加入新组，null表示移出所有组。缺失现场或文件夹拒绝NOT_FOUND；未知操作字段拒绝INVALID_COMMAND；空／过长title拒绝INVALID_INPUT。rename到相同规范title、assign到相同归属是无写入／无新seq／无事件的no-op。未知title可同名，身份由id决定。

操作沿既有HTTP：人经/kont/api/workspace提交revision+commands；Agent经/kont/command提交命令及可选baseSeq。使用原认证／Host-Origin／CAS／批次上限／原子磁盘写与事件发布，没有新transport。人和Agent复用同一applyCommand，事件source由调用上下文决定。folder不是权限组。

read／workspace返回organization，GET /kont/snapshot导出组织。frozen normalizeCanvasSnapshot保持原核心边界，扩展由Store的normalizeOrganization显式验证／保全。旧持久文件若顶层缺组织，在内存投影empty；读取／关闭不主动重写。有效修改时才随Store事务保存。

兼容边界：organization的无损往返仅由本卡更新后的Store路径验证。旧二进制或单独调用normalizeCanvasSnapshot不保证保全此扩展，可能丢失organization；不能直接用作迁移或降级工具。本卡未制备正式候选，也未验证生产数据迁移／降级。

restoreSnapshot同步规范化并复制输入；组织引用必须属于导入的Workspace。writer queue基于执行时当前state检查：缺organization而当前folders非空（即使仅空folder）拒绝ORGANIZATION_RESTORE_REQUIRED；显式有效empty表示有意替换。显式undefined/null/非法版本不能当缺失。Run evidence恢复guard保持，不允许导入抹除或替换Run记录；失败不更新状态、文件或事件。restore仍仅沿既有服务方法，本卡没有新增HTTP恢复入口。

服务／真实HTTP测试见worksite-folders.test.mjs和folder-protocol.test.mjs；只接受组织契约，不证明文件夹UI、完整Project或细粒度授权。
