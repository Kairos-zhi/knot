# KONT-DESKTOP-021 · 既存 pnpm store 兼容修复候选

来源：之于2026-10-25要求继续；020单次官方安装返回ERR_PNPM_UNEXPECTED_STORE，旧12文件、profile与现场hash未变，原claim／transport／uncertain回执永久保留。本卡不再次安装生产。

既查：复用官方PluginManager、019 transport及pnpm离线／禁脚本策略。空profile隔离安装已通过，但未覆盖既存.modules.yaml及file/link依赖；当前生产记录storeDir为D:/.pnpm-store/v11，transport另设ledger私store导致冲突。后端按官方既有store机制适配；不新建UI，Apple基准不变。

范围：run_maker修改scripts/desktop-quiescent-install.mjs、必要的store解析helper与tests；根负责中控文档，run_checker独立复核。只读取生产.modules.yaml取得非敏感store元数据，不复制凭据、Session或用户业务正文。不改签名应用／生产profile／旧冻结物／授权descriptor与一次性门。

验证：安全解析、异常／重定向拒绝；有既存node_modules及file/link依赖的隔离profile，真实官方manager保持offline／ignore-scripts升级25文件，核非Knot依赖与选择；旧执行门回归。隔离数据只在新建D:/Temp任务目录。任何新生产尝试必须形成已审方案及单独授权，不清原占位绕过重放保护。

Maker→自核验→独立Checker→Gate→入档；archive_id=kont-desktop-store-fix-20261025，证据evidence/local/20261025-desktop-store-fix。本卡仅修复候选，不代表升级已部署、运行active或完整产品接受；模型请求0、无push／merge。

既查落点：官方bundled pnpm11.28.5源码SHA e3738fda...8810，readModulesManifest／checkCompatibility／getStorePath明确记录和比较storeDir，已有v11后缀不重复追加；见maker/source.json及源码摘录。新增薄helper用官方YAML解析器读取有上限的.modules.yaml，拒重复key／alias、错版本、非本地绝对路径、点段／尾点空格及重定向目录；无node_modules才用私store，安装前再核store摘要。原审批／descriptor／ledger／RPC不变。

制作与独立核验：Maker9/9、Checker另跑9/9；解析17负例＋空私store junction，旧执行门5项，transport3项。官方离线／禁脚本在空profile及既存file/link依赖profile各升级一次，两者25文件逐字节一致；既存store、非Knot依赖spec／require结果及原选择保持。Checker额外只读生产resolver成功，modules／profile／data及旧020三ledger hash不变。隔离018 fence明确mock，不当成生产预检；完整生产依赖／cache／active未验。

七格收口：目标＝修正既存pnpm store冲突；回收＝Maker与独立Checker齐；证据＝evidence/DESKTOP-021-INDEX.json、AF/checker/final-review.json，Maker manifest967b4e1c...6cc2／11冻结项一致；验收＝ACCEPT_RECORDED_PNPM_STORE_FIX_LIMITED，无阻断；入档＝本卡／STATE／QUEUE／AF/controller/receipt.json；记录＝仅本地提交，生产重试与模型0；未决＝022独立后续执行能力与新明确许可、真实安装／运行／人的体验。此Gate不解除020原占位。
