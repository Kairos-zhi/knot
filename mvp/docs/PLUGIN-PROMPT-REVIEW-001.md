# PROMPT-REVIEW-001｜请Agent整体整理，再带回项目动态

2026-11-18，承接用户六点要求及随后的明确入口：不等待插件Agent握手，先按钮生成项目提示词→任意Agent窗口整理→回填预览核源→项目动态。用户已选只推送Knot内，不外发团队。

## 定义

“项目起点”是当前可读证据中最早能追溯的起因，和登记时间分开；当前状态是指定manifest版本的有来源概括，未知要写未知。里程碑是目标、路线、约束、成果或验收变化的自然语言概括，不是逐消息摘取或commit罗列。时间先后不自动成为因果，因果未证实写推断。所有Agent结果标明概括/待人核对，不产生user_confirm，不覆盖原整理。

按钮准备完整受权项目提示词，包含全部可读材料正文及原时间/定位、当前版本、来源覆盖、整理要求和严格返回JSON模板。scene没有不可读来源准确计数，coverage为readable_sources整数、has_unavailable布尔及unavailable_count:null，不据布尔编造数量。范围受既有读取/响应额度约束；超过额度明确拒绝，不静默切片后称全量。窗口里的原文是资料，不是Agent指令；无调用外部模型、无自动向第三方发材料。仅用户复制提示词时离开Knot。

可选本地开发记录扫描以启动时显式配置的project_id→root为边界，无任意浏览器路径。未显式配置时可沿现有CodexCapture从已登记project_id的唯一工程根目录派生范围，多根或归属不明则不猜；配置优先，不按名字匹配。只读Git log/status/统计和明确文档（README/STATE/QUEUE/AGENTS及有限docs），排除凭据、依赖、隐藏目录、链接及工程外路径；不执行工程代码、不移动/改名/改写源文件、不写Git索引。产物登记只记允许目录内普通媒体文件的相对路径、大小、类型与hash，不把文件存在推断为生成事件或用户采纳，不称已完整归档二进制。扫描返回普通document预览；保存沿现有project-import，旧版本保留；保存确切请求失败/未知结果沿现有恢复语义。

新增本地路由（projects开关+现有Host/Origin/explicit）：project-review-collect只读返回document（配置无root时明确提示，可继续整理已留存材料）；project-review-prompt只读返回提示词；project-review-prepare只读核Agent返回包，生成普通source document供现有project-import追加。三个准备动作均零业务写入。无新业务库、无平行项目权威。源工程只读的文件清单/hash前后对比和异机合成root测试属于本卡检查。

返回包knot.project-review/0.1：project_id/revision/manifest_hash；origin/current/completed/blocked/next各{summary,evidence}，evidence为既有{asset_id,content_hash,quote}最多4条；milestones最多12条{id,title,summary,on:null或YYYY-MM-DD,evidence(1–4条)}；gaps最多12个短句。summary最大8192 UTF8字节，整份保存document不超过64KiB。每条ref属于指定版本可读材料并逐字核quote；on有值须能在所附证据原消息/文档日期中核对。空证据的段落明确列为无出处待核，不当完成证明。来源验证不等于模型语义判断已被事实证实。

界面主入口“请Agent整理”，可选择先读取本机开发记录；提示词可选中复制，返回结果可粘贴。先显示人类可读预览（起点、现状、里程碑、三段工作回顾与缺口），再保存项目动态；过期版本冲突保留返回内容，可重新准备当前版本（显式更新绑定并重新核源），未知保存只重试原请求。不因跨项目切换把结果保存到新项目。已保存动态从普通material读取并呈现，日期浏览不冒充过去的完整快照。

用户追加：在Knot内呈现可视化工作流，前期人手动推进各节点提示词，后期Agent接手同一流程。现按“收集资料→准备提示词→等待Agent整理→核对结果与出处→入库并更新项目动态”显示有序节点、当前阶段和完成状态；点节点查看当前可做的动作/提示词，不越过核对自动写入。节点状态由本次现有准备/保存会话派生，不另造工作流业务库；保存后能从更新资料启动下一轮。不得把尚未接入的Agent自动执行伪装为运行中。

## 写集与角色

主Agent：本卡、project_review_collect.py及扫描测试、私有运行root配置和实际部署。后端Maker：project_review.py、workbench.py和领域/HTTP测试。前端Maker完成GLOBAL-TIME后接workbench.html及Node DOM测试。Popper独立Checker先定义再联合Gate；两张卡分别交付。不得推送/合并、不得修改用户源工程、不得把全局时间卡的Gate外推成本卡。

本卡交付可用的人触发整体整理闭环和只读开发记录采集。插件内模型握手、多宿主实机兼容、图片/视频正文的不可变归档与理解、商业平台同步均须实际实现并另核，不能用媒体元数据或一台机器的测试冒充完成。

用户设计批注覆盖旧日期刻度：实际界面以连续日历天浏览，纵向时间滚轮占侧栏主要可用高度，跟随主区每日分组，按天可展开完整记录；关键变化/普通推进的标签必须来自整体Agent归纳或明确原始类型，不以“推进”等词猜决定。首屏“整理这个项目”直接到Knot提供的真实整理指令，随时可回看复制。删除交接/工作面/示意占位等工程文案。历史窗口先检索关联、标明已读/部分/不可读，再一至三轮概括。

独立实现复核补正：Git父仓库可能越出子目录；Git status/diff可触发工程clean/process过滤器；root祖先及登记root预先resolve可能遮蔽junction；临时Git输出不能结束后才限量。因此仅采集exact root仓库的提交历史，不执行Git工作区status/diff；实际文档按字面读取。输出产生中保留最多8193字节并终止本次子进程；原始登记路径先核所有祖先链接再解析。以上属于已复现边界修复，不把hash未变当作工程命令未执行的证明。
