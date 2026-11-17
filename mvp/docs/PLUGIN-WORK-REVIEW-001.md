# WORK-REVIEW-001｜工作回顾与检查后分享

2026-11-17。用户要求完成当前阶段后马上接续第二阶段。MVP1决定轨迹切片通过限定Gate后实施本卡。

## 最小闭环定义

项目内提供工作回顾：今天完成了什么、卡在哪里、下次接着做什么。三段可编辑，可留空（显示尚未记录），不从工作要求推定工作已经完成。准备回顾只读，保存沿现有 project-import 普通 document，使旧版本可回溯，决定数不增加。首版提供带出处的整理与编辑能力，自动从执行记录抽取成果继续后续补全。

POST /api/work-review-prepare 请求闭合字段：project_id、revision、manifest_hash、day（YYYY-MM-DD）、completed、blocked、next（各字符串不超过8192 UTF8字节）、evidence（最多8项 {asset_id,content_hash,quote}，quote非空且最多2048 UTF8字节）。总请求沿工作台128KiB上限。服务端使用现有身份读取指定revision的受权scene，核manifest_hash，随后从同一版本读取material，核引用属于materials且quote为完整原文的逐字子串。三段至少一段非空。凭据检查复用已有策略。

返回 {project_id,revision,manifest_hash,document:{title,text}}，文本为用户可核的Markdown，含日期、项目、三段内容和出处（材料名、ID、hash、原话）。此接口不写入；保存复用现有版本冲突、幂等与权限规则。固定错误沿ProjectError：INVALID_ARGUMENTS、CONTENT_MISMATCH、ACCESS_DENIED、READ_UNAVAILABLE。默认未开启projects的服务不提供本能力；沿同Host、Origin、explicit保护。

用户检查后可准备本地分享文本，字段或出处变化使检查状态失效。没有默认团队、收件人或外发。首版分享是可复制文本，真实团队发送渠道在指定目标并授权后另接。检查不自动改变为已完成事实或用户正式决定。

## 角色与允许写集

后端Maker：mvp/devtools/work_review.py、workbench.py、test_work_review.py（纯生成和HTTP验证）。前端Maker：workbench.html、test_workbench_work_review.py。主Agent：本卡、实际服务和真实工作回顾内容准备。独立Checker：定义及联合实现Gate，不自验收。共用既有资产、manifest和服务，不新增业务库。

## 验证

绑定指定版本和原文出处；准备零写入；编辑、检查、保存、复制流程；版本冲突时保持内容；跨项目/撤权来源不进入回顾。Node DOM加HTTP合成库验证。真实工作回顾只记实际成果、未完成及下步，追加后读回，不自动分享团队。

## 联测中的版本恢复修正

独立联合134项通过后，额外反例复现确定REVISION_CONFLICT无法继续：返回修改仍绑定旧版本，切最新又清空内容。作为本卡必须关闭的实际使用阻断，加入明确恢复动作：保留日期、三段与出处，显式读取同项目最新版本并重新核源，清除旧检查/分享状态，重新准备后保存。不可用出处须提示；新请求只在旧请求已明确被拒绝后建立。未知结果仍保留原请求重试，不借恢复改写未知请求。

## 限定交付与实际读回

后端主Agent、前端Epicurus、独立Checker Darwin。后端独立26项及16个补充反例通过；前端初轮25项、工作台198项为Maker结果。恢复修正后Maker29项通过，独立定向62项通过；另用隔离HTTP与实际UI脚本核头前进、409、保留内容恢复、重新核源、重新预览及保存读回。唯一阻断关闭，8文件限定联合Gate PASS，接受清单指纹5ec550caeb7441dc7f114270ec18e451a7c5479e7e2105c6742d6192d8c9a0c6。各轮不累加为全库测试。

Gate后按记录进程身份停启同库并自动备份，未重导入回顾。公开HTTP追加实际开发验证记录与当天三段回顾，当前项目revision11、原9项回顾不变。实际准备接口零写入，真实响应驱动Node DOM验证预览、检查后分享文本、修改清除检查状态；自动跟随已恢复。当天回顾仍待本人检查，未分享或发送团队。真实入口与磁盘脚本一致。

这是工作回顾编辑、核源、保存和本地准备分享的首个切片。由执行记录自动抽取成果、跨日自动整理和真实团队渠道仍未实现；未称完整MVP2或人的体验接受。真实资料和回执只保存在任务私有目录。
