# DESKTOP-031 独立复核

结论：`ACCEPT_INSTALLED_WORKSTATION_INTEGRATION_LIMITED`。无阻断，接受本次synthetic fixture候选的官方隔离复制后工作站纵切，不代表真实root发布候选或在用部署。

Maker manifest `91ba060b...7efbbf6d` 独立复算，10/10登记匹配：5项工具/测试/helper、5项报告日志。官方bundled Node独立build退出0；聚焦58/58：031新4、相关旧52、Checker自有2，0 fail/skip。无产品源码或inventory改动，无关全量未跑。

独立实际复建26项fixture候选，经官方offline/ignore-scripts临时profile安装一次，复制字节前后26一致。固定worker从profile中真实pnpm复制路径加载index/store/client bundle，三项入口realpath/hash与10个checks记录在focused.tap。真实HTTP的保存POST、草稿echo与磁盘持久读回、完整供给block/历史条数、ownPOST不误锁、外部同store写入真实SSE触发dirty保护/写屏障、手动refresh只读、显式再保存、组件/plugin/订阅清理均通过，最终订阅0。

fixture commit `4e17d544...1f6846` 与候选pin `877fe896...265293` 仅属于本次隔离测试输入；不冒充当前root提交或生产许可。回执仅path/hash/checks，不含正文/token。数据为新建synthetic状态，工作站桥使用synthetic header认证；官方Connection cookie认证仍由原compat worker另行核验，不混称同一条链。

维护性通过：官方verifier保持默认路径，显式固定--workstation/options布尔值才选固定worker，不执行候选metadata脚本；仅v2允许新纵切，不凭format自动宣称新能力。helper只注入bundle/baseURI/transport，不复制业务逻辑。worker先核受控temp profile和installed真实路径后import，无repo回退。SSE桥为有界测试字节读取器，不新造产品polyfill/业务同步框架，超时与finally回收、temp删除边界明确。

自有负例验证EOF与非法UTF8各只一error/一次transport、不重连或busyloop；未知option在候选读取前拒绝；即便profile是合法新temp前缀，repo plugin仍在import前拒绝。原专项逐字节UTF8/CRLF/注释/reset继承id/abort也独立通过。

另独立运行旧真实014默认官方验证：原pin `a1f00e43...5f1755a8` 临时实际安装/复制25、runtime/renderer成功，exit0且无workstation字段，见legacy-default.log；旧候选字节不改。原default、不兼容版本拒绝、当前清单26及真实root干净HEAD/受追踪输入门均保持。两份API文档与实现一致。

复制服务/HTTP/SSE为真实隔离字节链，renderer仍factory/hook、EventSource为测试桥。没有验证native EventSource、实际dsh-app长流、ReactDOM/布局/视觉、正式Apple或人的体验。未触生产data/profile/ledger、凭据/用户Session、桌面UI启停或生产安装、系统、模型、真实root提交/push/merge、完整Run或完整产品；未重试SSR/装依赖。
