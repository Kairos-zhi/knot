# KONT-DESKTOP-031 · 安装副本工作站纵切

2026-10-25，之“继续推进”，沿用子Maker/独立Checker。既查baseline/STATE/QUEUE、025候选格式/工具与测试fixture、024–030回执、旧desktop-compat-worker及workstation helper。现官方manager已能离线隔离安装复制26文件，但复制后的renderer只检工厂/slots，尚未把新工作站行为连验。后端复用既有内核/协议，不新增业务规则或竞品机制；前端沿同对象/连续性，不扩旧表单或另定设计。

目标：在官方验证器本次隔离安装后、profile清理前，显式运行固定的测试侧worker。服务index/store和client bundle都从实际复制路径加载，禁止回退repo或候选原目录。使用新synthetic数据/真实loopback HTTP，通过实际built factory/hook验证草稿保存与持久读回、完整供给预览、外部写入真实SSE通知→过期屏障、手动refresh保留本页draft/解除、之后显式保存，以及卸载/订阅关闭。

最小实现：scripts/verify-desktop-candidate.cjs保留原默认行为，显式options.workstation/CLI固定--workstation才调固定tests/desktop-workstation-worker.mjs；不按v2格式假定具备全部新能力，旧v1仍保留默认核验，显式新纵切仅v2。调用保留外部expectedManifestSha256、精确26copy/hash/host版本闸门，不能增加allowDirty/松动真实root干净HEAD或受追踪输入约束。worker入口路径固定，不从候选metadata执行任意测试脚本。

worker显式收到installed plugin/profile根，realpath位于本次受控临时profile后再加载src/index.mjs、src/store.mjs和lib/client.js；不读真实用户profile/数据/凭据。helper可注入bundlePath/baseURI/真实fetch，原默认接缝和断言不弱化；receipt记录路径/版本/hash与checks，不输出synthetic正文或token。安装副本26校验前后均保持，结果只代表这次fixture候选。

EventSource使用仅测试侧HTTP字节流桥：实际读取服务SSE并调用EventSource形状回调，无自动重连。可新增tests/helpers/http-event-source.mjs，保持范围为服务实际使用的普通id/data/reset/注释及close；考虑UTF8/chunk边界、reset继承id、abort清理，失败不默补正文。禁止把它打进产品或当成浏览器native能力证明，不新增依赖/通用SSE框架。具体传输/集成等待须有期限，失败退出仍回收订阅/服务/store/profile。

允许verifier、新worker、新tests/desktop-workstation-integration.test.mjs、现tests/helpers/workstation-client-fixture.mjs及新HTTP adapter。若需额外测试文件可先报根。不改产品源码/当前26或历史25清单/build/宿主包/生产安装门；根维护任务/状态/API说明。所有复制、临时安装和fixture-local git commit仅在新受控目录，删除前核绝对root边界与前缀；无真实root commit。

验证：新26 temp-git fixture prepare→官方offline/ignore-scripts manager复制→固定worker，同一复制服务/renderer真实HTTP纵切；POST落盘、同次seq预览/来源、真实事件不误锁ownPOST、外部变化保dirty/禁写、refresh只GET、显式保存、清理。给copy路径/hash及模型0/生产false的可读receipt；不以文本匹配代替行为。回归旧candidate/default verifier/版本拒绝、026–030 helper调用、旧014原pin25保持。独立Checker复建并加自己的篡改/路径或行为负例，不自验收。

证据evidence/local/20261025-installed-workstation；archive_id=kont-installed-workstation-20261025。Maker=workstation_maker，独立Checker=deployment_checker，根Gate。当前ACCEPTED_LIMITED。无生产data/profile/凭据/Session/模型、系统或在用Desktop启停/安装、真实root提交推送合并；不生成真实root正式候选，不接受actual dsh-app长流/原生EventSource/ReactDOM/人的正式Apple体验。

独立Gate=ACCEPT_INSTALLED_WORKSTATION_INTEGRATION_LIMITED，无阻断，人类维护性通过。10/10冻结项匹配，独立build退出0；聚焦58/58（新4＋相关旧52＋Checker自有2），无失败/跳过。当前26实际官方offline复制后，installed index/store与bundle路径/3加载hash核实，10行为checks/subscriptions0及26字节前后保持；另独立旧014原pin25默认官方隔离验证exit0/无workstation字段。自有EOF/坏UTF8单error无重连、未知options及合法临时profile搭配repo plugin加载前拒绝通过。

七格收口：目标＝安装副本工作站纵切；回收＝子Maker冻结/独立Checker完成停写；证据＝AP与DESKTOP-031-INDEX；验收＝官方隔离复制包服务/renderer factory-hook经真实HTTP/SSE测试桥限定接受；入档＝kont-installed-workstation-20261025；记录＝本卡/STATE/QUEUE/API/控制回执；未决＝真实root候选/发布提交、在用部署、native EventSource/actual dsh-app/ReactDOM/人的正式Apple体验。fixture commit/pin为测试产物，不是root release或生产许可；synthetic header认证与原compat worker的官方cookie认证分开。
