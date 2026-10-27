# RELEASE-032 独立发布准备复核

结论：`ACCEPT_RELEASE_READINESS_LIMITED`。仅接受具体可审准备计划，无准备材料阻断；真实branch/stage/commit/正式候选仍缺新明确许可及本地先行例外，不执行。

Maker manifest `759eb64f...9d80e497`与4项证据一致。计划50路径与当前Git变更精确同集：13 tracked修改＋37 untracked文件，稳定48项bytes/hash匹配。STATE/QUEUE为预先声明的控制检查点，根MAKER→CHECKER已改变二者；不误作稳定内容篡改。根收口后只能改这两份，再出final50，独立Checker仍需终读50全部hash与同allowlist。032所有产物保持ignored，不加入自引用提交范围。

最新031索引49/49全部条目匹配，覆盖当前26产品。其余17索引中的395条evidence/local冻结引用逐hash匹配；按条目计，可能重复文件。早期产品/helper被后继已审卡修改，不要求历史源hash等于当前；不把正常演进称篡改。

真正产品门只有5项：lib/client.js、src/client.cjs/index.mjs/store.mjs已tracked但不同于HEAD，worksite-preview.mjs尚untracked；其他文档dirty不是prepare产品门。本轮只读Git与hash，没有运行prepare/build/test。当前HEAD 45ccd24b...c58d76244、bootstrap分支、remote空、staged0，diff --check通过。

50文件均属已审023运行记录与024–031代码/工具/测试/API/卡/索引及共用入口。显式allowlist合理；禁止git add .，排除.runtime/node_modules/evidence/local/候选/profile/ledger/用户数据。lib/client.js虽然ignore但已tracked，应明确列入；不force-add其他ignored材料。

已独立读上级&lt;user-home&gt;/AGENTS.md：bootstrap后须separate branch＋PR，缺authority failclosed。历史一次本地commit许可已消费，无remote不能做PR。本轮不创建branch或写Git配置；需用户新明确批准本次新本地codex/workstation-release-032分支、精确50文件一次本地提交＋真实HEAD候选/隔离核验，并明确PR待远端的本地例外。此范围不包含push/PR/merge、在用部署启停、系统、模型或生产数据。

授权后仍须核final50/hash→仅显式stage→审暂存与换行字节→一次commit→新HEAD受追踪/产品一致→build不漂移→全新ignored目录prepare26并产生新pin→官方offline隔离--workstation与独立复核。不能把fixture commit/pin或旧58专项直接改名为正式候选，也不amend追逐receipt。

测试安全仅初查：49顶层入口涉及旧runtime、官方临时profile、环境覆盖和历史清理，不具完整传递安全审计。本卡没运行或宣称全量安全/全量通过。031原build/58和旧25默认官方验证是历史已验锚，不因本轮无产品改动重复昂贵验证。正式候选转锚仍需上述窄检查。

未触生产/profile/ledger、凭据/Session、桌面启停安装、系统、模型或真实Git变更。准备接受不等于提交、候选、PR、发布、人的体验或完整产品接受。
