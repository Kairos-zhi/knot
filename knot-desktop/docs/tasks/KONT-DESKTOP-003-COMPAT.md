# KONT-DESKTOP-003 · 0.2.1 兼容与真实桌面加载

日期：2026-10-22。用户授权：继续迭代；沿用官方桌面宿主与中控开工授权。状态：`ACCEPT_DESKTOP_INTEGRATION_LIMITED`，独立限定接受本卡接入范围。

## 既查与取舍

- 以根 AGENTS、开发基准、KONT-DESKTOP-003、首卡冻结证据与官方桌面安装回执为起点。原安装与软件入口已限定接受；Knot 插件尚未加载。
- 官方桌面固定 0.2.1-rc.2，D盘应用／home／user-data；原 Headless 0.1.7-rc.2 仅为回归入口。桌面 profile 由官方 Host 独占。
- 竞对研究 A 已由独立 Checker 限定接受（38项本地来源核对、10项官方固定版本重取同哈希）。复用共用控制面与生命周期 owner 的思想；本卡不实施研究中的 CAS、Run 或输入清单候选。
- 复用同一 Knot 内核／存储与官方 bundle/pluginManager；适配新版真实接口，不能改签名 ASAR、宽泛版本声明、豁免版本闸门或用旧 CLI 手改桌面 profile。治理远端表未新增全域检索，不宣称全域既查。
- 前端遵守 Apple 工作站方向；本卡只接宿主和已有客户端入口，不扩写旧表单、不声称正式前端与人的体验已接受。

## 分工和修改域

| 角色 | 任务 | 允许写入 |
|---|---|---|
| kont_maker | 核对官方固定接口，最小兼容适配与自测 | packages/dsh-plugin/**、packages/desktop-bundle/**、tests/desktop-compat*；build脚本若需改先报中控；evidence/local/20261022-desktop-compat/maker/ |
| kont_runtime_maker | 官方Host认证/transport/管理API与程序化工具 | scripts/desktop-host-*.mjs、tests/desktop-host-*.test.mjs；evidence/local/20261022-desktop-compat/runtime-maker/ |
| 中控 | 证据回收、阶段Gate、官方API安装及运行验证协调 | 本卡、STATE/QUEUE/README、controller证据；候选审查后才实际安装 |
| kont_checker | 独立复核冻结候选、真实桌面加载及持久化 | evidence/local/20261022-desktop-compat/checker/；不得制作候选 |

Maker B 只读查证时不得安装或改桌面profile；不得把token落日志或报告。所有角色禁止模型调用、外部消息、提交推送合并、截图或模拟点击验证。

接入运输补充：官方打包桌面不公开Host凭据与退出RPC；CloseMainWindow仅隐藏。候选方案为中控受控关闭本轮启动的空白桌面（首次bootstrap终止明确不算正常退出证据），临时使用仅loopback的renderer CDP调用固定dsh-app同源官方API；如需正常退出证明，main inspector仅允许固定`app.quit()`表达式。预先独立检查工具与官方退出链，核对监听地址、版本与目标，禁止任意脚本、凭据读取、截图/点击。验完关闭临时调试端口，恢复普通启动；若打包宿主不支持则登记阻断，不冒充正常退出。

真实renderer证据补充：官方boot图、模块下载与Host fiber均不能单独证明client apply/slots注册。中控授权在Knot client添加最小无凭据只读注册回执，只含固定module/version和实际apply/main/sidebar注册标记，处置后失活或移除；不能含资产、草稿、DOM、用户身份或token，不能形成业务状态权威。由固定程序表达式读回并独立复核，仍不等于人的视觉体验验收。

## 验真与 Gate

1. 固定新版源码和已安装库，查 connection/webServer/client injection/Cordis effect/认证生命周期；精确版本声明有依据。
2. 旧内核测试回归，新版接口兼容自测；冻结源与构建哈希，独立Checker审查兼容与接入工具。
3. 经官方实际Host API inspect/installBundle/listBundles/listPlugins，安装同一插件；记录兼容检查与失败，不绕过拒绝。
4. 桌面运行Host内插件活跃、已有客户端入口注册；通过 snapshot/command/events完成同内核程序化纵切、负例与数据读回。客户端入口注册不能代替人的视觉体验验收。
5. 正常关闭/重开桌面，核对相同数据路径、状态和seq；不以Headless启动替代。若宿主自动重载，核对稳定终态与活动实例。
6. 独立Checker另行限定接受；未覆盖真实模型/完整Run、正式前端、强杀断电与生产部署。遇具体阻断先保存证据，不假通过。

## 入档

archive_id：kont-desktop-compat-20261022；检索键：Knot、DSH Desktop、0.2.1、pluginManager、同内核。摘要：将已接受Headless内核接入官方桌面。证据：evidence/local/20261022-desktop-compat/。最终Gate与七格收口见下节。

## 最终 Gate 与七格收口

命令覆盖纠偏（固定旧HTTP服务08a2a53口径）：支持5/16；未覆盖11/16＝knot.delete、rope.disconnectAll、chain.thread、chain.get、generate.grow、generate.fromSelection、tool.set、tool.get、focus.set、expand.set、pin.toggle。支持项中ping/knot.create/knot.update为共同直接执行，rope.connect/disconnect从旧Bridge入队适配为直接执行；另有6项worksite/presentation和2项UI别名，不计原协议分母。外部卡“6/17”不符合该枚举，未沿用。

- 目标：官方桌面0.2.1兼容、实际插件加载与同内核操作完成。
- 监听回收：A r2、B r2及独立Checker回执已收；B旧动态import退出失败与首次bootstrap终止均保留，不计作正常退出通过。
- 证据：`candidate-manifest.json`共34项，SHA256 `2C9265562AABEBA8BAD388387C6CBABEF14ACC22DBAAE0063CE2E2AC0F595FFA`；独立34/34测试、真实桌面8步纵切、Host active与renderer注册回执、两次正常app.quit与重开读回。签名EXE／ASAR未变，官方manager一次安装应用成功。
- 验收：`checker/final-review.json`为`ACCEPT_DESKTOP_INTEGRATION_LIMITED`；`checker/manifest-check.json`独立复算34/34清单一致。Checker实际只读验证重开实例与最终普通启动；退出动作由中控执行并留证，不冒称Checker亲自启停。
- 入档：本卡、STATE、QUEUE、README与上述证据；冻结时manifest的pending状态是历史时点，最终接受以Checker回执为准。
- 记录：最终官方桌面普通启动，无临时调试端口或调试参数，D盘数据seq8与SHA不变；保留两个明确标注的接入验证材料。未调用模型、提交、推送或合并。
- 未决：真实模型／完整Run、正式Apple工作站与人的体验、强杀／断电恢复、生产部署不在本卡接受范围。
