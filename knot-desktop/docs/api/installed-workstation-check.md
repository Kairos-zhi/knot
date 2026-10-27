# 安装副本工作站检查

031已独立限定接受，见[任务卡](../tasks/KONT-DESKTOP-031.md)。在既有26文件候选核验与官方管理器隔离安装之后，显式运行工作站集成检查；默认验证行为继续保留，不因候选格式v2就自动宣称具备全部新能力。

维护入口是scripts/verify-desktop-candidate.cjs，使用官方Electron RunAsNode运行：参数为候选绝对目录、外部已审manifest SHA256、固定的`--workstation`。新模式仅接受v2，省略该标志仍走原默认核验；不接受任意worker脚本参数。测试入口为tests/desktop-workstation-integration.test.mjs。

检查从此次临时profile中的真实复制目录加载服务index/store与renderer bundle，不能回退当前仓库或候选原目录。所有数据为新建synthetic数据，HTTP仅loopback；通过实际工厂和hook接缝连接复制服务，核对保存、持久读回、供给预览、变化通知和手动恢复。路径和文件字节单独核对。

SSE桥仅用于测试：它读取真实HTTP帧并调用EventSource形状接口，处理服务使用的id/data/reset和关闭，不自动重连。它不是产品polyfill，也不证明浏览器原生EventSource、实际dsh-app长流、ReactDOM布局或人的体验。

隔离检查始终使用官方manager、offline/ignore-scripts和独立profile，不加载真实profile或用户资产；结束或失败都回收服务、store、订阅和临时安装。回执只记录检查项、版本、路径与hash，不输出正文或凭据。

测试通过只接受此次fixture候选的复制后行为。fixture-local提交不是当前checkout的发布提交，真实root干净HEAD/受追踪输入闸门仍保持；正式root候选、独立发布复核、实际安装许可与正常重开验证仍需后续步骤。
