# RECAP-EDIT-001｜可修订整理的阅读与保存闭环

2026-11-17，基线d079de8。承接继续推进及用户“同一项目数据可由Agent灵活整理”。本切片让已有curated_recap能在页面中直接修订，同时为Agent提供读取完整来源的常规接口。

## 定义

ProjectMaterial增加可选source，保持旧六字段有效。核心读取在同一受权版本取完整decision-source，返回source时须与asset hash、title、text一致；broker校验canonical source hash后才传出。原文、来源定位及日期不改，仍按已有reader与敏感/响应额度。

POST /api/recap-prepare（仅projects启用，沿Host/Origin/explicit保护）请求闭合字段project_id、revision、manifest_hash、item_id、title、after、note。title非空<=256 UTF8字节；after<=2048、note<=1024。服务重新读取固定scene，逐条读取现有回顾引用的完整source，验证权限/hash/逐字引文/日期。只允许修改已有个人整理的title、after和追加本次整理备注；reason、before、日期、evidence及其他条目原样保留。note存入caution，标明“本次整理备注”，不冒充历史原因。文档方案不在本编辑入口修订。无实际变化拒绝；不静默截断备注。

返回{project_id,revision,manifest_hash,recap}，recap为现有decision-import/0.1包。准备只读，旧版兼容服务缺source时明确READ_UNAVAILABLE，不拼造元数据。校验包及ProjectImportRequest预算和响应上限。保存复用现有/api/project-import带recap，原子追加版本、保留原文和旧整理，不产生user_confirm。

页面在个人整理侧栏提供“修订这条整理”，展示原原因/出处，编辑整理标题、方向和本次备注，先看预览再保存。未知保存结果保留原请求重试。明确版本冲突后可显式更新到最新重新检查，保留文字并重新核源；目标item已不存在时提示，不能自动新增替代它。切项目/版本不把晚响应绑定到别处。默认页面不增加请求；编辑是明确动作，完整source不因此自动选入其他草稿或发送团队。

## 分工与验证

主Agent：project_repo.py、project_policy.py、schema.json、devtools/recap_edit.py、workbench.py、领域/HTTP测试及实际入口。前端Maker：workbench.html、test_workbench_recap_edit.py及必要旧UI适配，不削弱原话/卡位/版本隔离断言。独立Checker先定义后最终Gate，Gate后同库备份、导出固定代码快照并真实读回。仅本地提交，不push/merge/模型API/系统安装。

验证来源导出hash/权限、准备零写入、只改选定条目且保留原原因/日期/来源、用户文字始终作为整理呈现、旧版本可读、未知重试和头前进后的恢复。真实环境只读准备检验；如追加演示修订，须是对当前用户要求的准确整理，不补造事实。

## 实现与限定Gate

主Agent后端及来源契约，Archimedes前端，Laplace独立定义/最终Gate。ProjectMaterial完整source与旧字段兼容，准备接口核固定版本的全部引用；侧栏修订标题/方向/当前备注，预览后沿同一项目操作保存。未知结果重试原请求；明确冲突可保留输入读最新，目标消失不自动新建替代。

主Agent首轮所选308项通过，增加总备注额度反例后recap_edit12项通过。独立后端313项通过、recap_edit12项及补充Host/explicit/来源/旧版本反例通过。前端Maker工作台227项通过。独立最终联合248项通过，另真实HTTP包接Node DOM预览/保存1项（合成库）及晚到unknown/conflict/prepare三组检查通过。各轮有重叠，不累加为全库结果。

最终联合Gate PASS，无阻断；绑定d079de8上9文件暂存候选，未暂存改动为空，后端字节与此前限定PASS一致。允许固定快照、同库备份后更新和真实只读准备核验，未把代码Gate称为人的体验接受。真实部署回执另保存在任务输出。
