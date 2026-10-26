# KONT-ARCH-040 · Run与资产跨版本投影

2026-10-26；Maker候选，独立Checker／根Gate另记。archive_id=`kont-arch-epoch-20261026`；检索键：ARCH-03、Run epoch、present missing unknown、产物定位。

目标：收口新Run事实与旧assets混用导致的错误失效结论，贯通panel、导航回调及已开产物预览。历史Run phase可以独立到达；当前产物present/missing只能在可组合版本判断。

既查：历史架构finding ARCH-03、当前source/panel/client与原panel/source/client测试、038状态及039 Gate；沿已预核TASK不另研究。039已限定接受后取得完整84路径新baseline；原Checker设计预核与根正式开工均已记录，预核不代工程接受。

改动：panel导出普通纯seq join谓词，assetSeq/runSeq均有效且相等才允许判断产物存在／缺失；不同版本或缺／坏epoch为unknown，保留四phase历史，提示位置待核对并禁定位。旧快照无目标标题时中性待核对，不跨版本说目标移除。同版本缺块仍保留历史完成与位置失效解释。

client使用真实seq；导航捕获当次Run source对象和asset快照对象，执行时核最新对象／epoch／completed引用tuple，再沿原resolveRunOutput解析当前块。已开预览同样同步gate；source每次emit产生新对象，故同seq loading→success即使无loading render也永久失效旧令牌。effect仅清理引用，不承担首帧隐藏。无新source/API/总线，原source generation/floor及WorkIsland phase保持。

允许产品client.cjs、run-status-panel.cjs、生成lib/client.js；新tests/arch-run-epoch.test.mjs、本任务/API和本地Maker证据。根批准旧tests/run-status-panel.test.mjs仅base补相等assetSeq/runSeq，旧断言全部保留。未改source/view/server/helper/vendor/039源或清单；低层resolver未被改成全局权威。

自核验：build0；12个明确相关入口69/69（本卡7），git diff --check0；baseline84排除本卡制作输入／控制文档后的80项全部字节保持。新测试用实际临时Store合成完成和真实loopbackHTTP交叉读，覆盖新Run旧assets未知→同版可定位→真缺失历史保留、旧同ID块仍unknown、同seq刷新／无loading render不复活、旧回调／tuple变化／错误屏障、较旧／缺坏epoch与中性标题。

权限与边界：无模型调用、生产profile用户数据凭据Session、系统软件启停安装、branch stage commit PR push merge／正式候选；不是ReactDOM、native EventSource、真实宿主或人的体验接受，未解决其他ARCH／发布债或G3/G4/G5。

七格：目标为ARCH-03派生状态事实边界；监听回收沿原source；证据见manifest／日志；验收待原独立Checker／根Gate，不自验收；入档本卡和本地证据；记录本地候选；未决为其余ARCH与真实宿主／人的体验。
