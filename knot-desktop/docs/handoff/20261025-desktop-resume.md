# 2026-10-25 Desktop 接续卡

仅当前checkout的短交接；最新状态以根STATE.md／QUEUE.md及各任务独立回执为准。工作目录C:/Users/x2270/Documents/ChatGPT/KONT，分支codex/kont-dsh-plugin-bootstrap。先读AGENTS.md与docs/development-baseline.md，继续既查→Maker→独立Checker→Gate，不自行合并。

## 已确认现场

- 官方软件D:/DSH-Desktop/app/DeepSeek Harness.exe（dsh0.2.1-rc.2），home／user-data／kont-data均在D:/DSH-Desktop；只用官方PluginManager，不手改profile或签名ASAR。
- 020用户明确“我授权”后，根唯一一次真实安装失败：ERR_PNPM_UNEXPECTED_STORE，manager changed:false/application:failed/exit1；旧代码全库存12／12保持，profile074125fa...d5283、datae0359bb6...c79ac保持。独立结论CLOSED_FAILED_INSTALL_PRESERVED；未升级。
- 2026-10-25根已通过scripts/start-desktop.ps1普通无调试打开旧Desktop；独立5官方进程／原数据锁读回，根核一窗口有响应。该证据不等于renderer、新插件active或人的体验通过。继续前重新核进程，勿重复启动、强杀或删除锁。
- 生产ledger=.runtime/desktop-install/explicit-user-approval。parent=928f28736af4fc2f820e9d4eae53341872e6890d401e9932bda32028830d77a9，claim=reserved、transport存在、result=uncertain，三记录永久保留；旧initial入口必须继续拒重。
- RUN-011的DS Flash≤3元授权已1/1消耗，本轮模型调用0；不续用、不读凭据／用户Session、不push／merge、不截图点击验证。

## 候选与证据

- 014升级25文件：evidence/local/20261024-desktop-package/candidate，manifest=a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8。
- 017派生恢复13文件：evidence/local/20261024-desktop-recovery/candidate，manifest=774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d。原015旧store写入会丢Run journal，不能当兼容恢复。
- 020已归档：evidence/DESKTOP-020-INDEX.json及evidence/local/20261024-desktop-installed/checker/final-review.json。回执只支持失败保全与旧软件普通启动。
- 本地提交：27b7b16记录020失败保全；8aefdc5为021修复。022最终提交以git log及STATE为准；不推送／合并。
- 021：docs/tasks/KONT-DESKTOP-021.md；evidence/local/20261025-desktop-store-fix。修复读取既存.modules.yaml沿用官方recorded store，保持offline／ignore-scripts；空与既有file/link隔离profile均25项一致。最终Gate及提交见STATE。
- 022：docs/tasks/KONT-DESKTOP-022.md；evidence/local/20261025-desktop-reconciled-attempt。固定parent失败证据与021修复pin，父→唯一child链接先wx+sync，再独立childclaim／permit；不能通过换id/namespace/数据hash重试。最终Gate及生产授权状态见STATE，不能把本接续卡当安装许可。
- 022已独立限定接受：20冻结／focused10项＋资格11负例／谓词5分类。具体preview=上述证据/controller/reviewed-proposal.json，SHA1da1b0dc0adf0a3bac2840113dc9e149e731e9ceac633b26e38757e053ae5df4，另有checker/proposal-review.json。没有新明确许可、完整fresh018或生产后续占位；preview不是签发plan或部署。

## 接续顺序

1. 核git status／最新提交／STATE／QUEUE／021与022独立Review，先完成未收口工程。
2. 新生产尝试必须有具体已审022方案及新的明确许可；没有时只准备，不签human、不调用execute。一般“继续”只授权开发，不重置020机会。
3. 获准后应从软件／托盘菜单正常退出（close窗口会收后台，不能充作退出），fresh018必须无原锁／无Desktop进程；完整prepareReconciledDeploymentApproval必须精确生成上述preview SHA，且核原profile／data／旧12／store映射／修复实现和证据pins。禁止清锁、强杀、模拟点击或放宽fence；任一hash变更不执行。
4. 仅一次官方后续安装；保留所有父子记录，失败／超时不再发。先核25已装字节、非Knot声明／选择和原数据，再正常打开做程序化active／renderer／持久读回，独立复核。
5. 临时loopback验证与最终无调试普通启动分开记证据；人的Apple体验仍待之过手。

新窗口可用：先读取本接续卡、STATE.md和QUEUE.md，核对工作树及独立回执后接续当前未完成卡；不重跑020，不自动执行生产安装或模型调用。

## 上下文判断

建议本轮工程收口后在新窗口进入下一次生产部署阶段。当前可见接口没有提供精确剩余上下文比例，本建议基于会话跨日、包含多个已消费与待批准授权阶段，以及减少交接歧义的需要。OpenAI Docs说明Codex支持compaction续接长任务，不能仅凭对话轮数断言上下文已满：[官方说明](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide#compaction)。换窗口时只带本卡及当前事实源，不复制完整历史；本窗口不自动创建新chat或迁移用户任务。
