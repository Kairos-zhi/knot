# KONT-DESKTOP-003 · 官方桌面宿主与 Knot 接入边界

日期：2026-10-21；进展更新：2026-10-22。状态：安装、入口与开发约束已独立限定接受；插件兼容与真实桌面加载也已获独立限定接受，见 [兼容子卡](KONT-DESKTOP-003-COMPAT.md)。

## 目标与授权

之已授权将官方 DSH 桌面版安装到 D 盘，并明确 Knot 开发也面向该桌面版。产品入口为官方 Electron 桌面应用；Headless／HTTP 启动仅用于服务层与协议测试，不作为产品交付。沿用“后端对齐竞对、前端对齐 Apple”、人和 Agent 共用内核、宿主无关接入，以及 Maker／Checker 分离。

## 既查与来源

- 当前 `@kont/dsh-plugin` 与内核沿用首卡限定接受候选，不改动其冻结文件。`scripts/dev.mjs` 使用 CLI Web profile，并非桌面启动器。
- 当前插件的 `dsh.client.platform = web` 是 DSH 共用客户端平台声明；官方桌面使用同一 Web 客户端并由 Electron 承载，入口为 `dsh-app://app/`。这不是“只能在外部浏览器运行”的限制。
- 当前插件没有 `dsh.bundle.patch`，不能经当前桌面管理器启用：官方 `0.2.1-rc.2` 的 `installBundle` 对缺少 bundle 的包返回 `not-bundle`，并恢复 manifest／lockfile，不能据此声称插件已安装或启用。新增独立 `@kont/desktop-bundle` 只负责把同一插件插入官方组合，不复制内核或另造资产权威。
- 旧 CLI 与已验插件固定 `0.1.7-rc.2`；官网当前 Windows 安装包由中控确认 `0.2.1-rc.2`。新增 wrapper 保留旧版本精确 peer，故在新桌面上应被兼容闸门拒绝，直到单独形成并核验新兼容候选。不得删除版本约束、授予 version exemption 或静默升级旧 CLI 来绕过。
- 已读官方固定 tag `dsh-v0.1.7-rc.2` 与 `dsh-v0.2.1-rc.2` 的 Desktop README、paths、Host 启动和 plugin-manager 源码；本地下载及清单位于 `evidence/local/20261021-desktop/maker/`。上游依据：<https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/apps/desktop/README.md>、<https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/packages/boot/plugin-manager/README.md>。

## 修改域与最小变化

允许文件：本任务卡、`scripts/start-desktop.ps1`、`start-kont-desktop.cmd`、`packages/desktop-bundle/*`、Maker 本地证据。中控负责 STATE／QUEUE 和安装；Checker 独立复核。冻结首卡源码、原 CLI 安装及数据不在修改域。

- 桌面启动器使用 `D:\DSH-Desktop\app\DeepSeek Harness.exe`，验证签名，进程级设置 `DSH_HOME=D:\DSH-Desktop\home`、`KONT_DATA_DIR=D:\DSH-Desktop\kont-data`，通过 `--user-data-dir` 指定 `D:\DSH-Desktop\user-data`。不写全局环境变量，不打印 token。
- `-PrepareOnly` 只校验启动文件并准备目录，不启动应用。普通启动只打开官方桌面，不自动安装或启用 Knot；不得把启动成功误写成插件接通。
- wrapper 声明 `dsh.bundle.patch`，通过 bundle patch 插入 `@kont/dsh-plugin`，仍指向同一内核。精确旧版本要求有意保留，当前为待兼容候选。

## 官方安装与接入路径

官网：<https://www.deepseek.com/download/>；Windows 下载：<https://download.deepseek.com/desktop/dsh-latest-windows-x64.exe>。安装器为当前用户 NSIS；`0.2.1-rc.2` builder 配置 `allowToChangeInstallationDirectory: false`，不声称界面允许选择安装目录。本轮中控已实际使用标准 NSIS 命令参数 `/S /D=D:\DSH-Desktop\app` 指定空目标安装，并核对签名、版本、哈希、安装退出码及安装后读回。

`$DSH_HOME/profiles/desktop` 由 Electron 独占。CLI 不得启动或修改该 profile；不能用外置 pnpm 或手工 patch 将插件塞入正在运行的桌面配置。`DSH_DESKTOP_USER_DATA_DIR` 是官方开发 launcher 变量，packaged 主程序不读取它；实际使用 `--user-data-dir` 后仍须落盘核实。

官方桌面插件页使用认证 Host API。程序化接入应复用同一 `pluginManager/inspect`、`pluginManager/installBundle(spec, options)`、`pluginManager/listBundles`／`listPlugins`，本地 spec 为绝对路径。管理器在 pnpm 运行前检查本地包的 DSH requirements；严格旧版本应返回 `incompatible-version`。传输、认证与 request 格式须以已安装 0.2.1 Host 的真实契约为准，不能猜接口路径。内置 pnpm 位于 `resources/runtime/primary-runtime/dependencies/pnpm`，由官方管理器调度。

## 核验与 Gate

1. 检查已安装 EXE 版本、签名、真实进程和 D 盘 home／user-data 落盘；这仅证明桌面软件运行。
2. Checker 独立检查启动器、wrapper 的 patch 和版本拒绝策略，以及冻结文件未变。
3. 新兼容卡需覆盖 0.2.1 的 connection／webServer／Cordis effect、客户端注入、鉴权和生命周期；通过后才能形成支持 0.2.1 的版本声明候选。
4. 使用实际桌面 Host API 安装该兼容候选；读回 bundle 已启用、插件实际活跃，真实 `/kont/snapshot` 与 `/kont/command`／SSE 接入同一存储，正常关闭／重开后数据保持。
5. 不使用截图或模拟点击验证 Knot；前端 Apple 工作站呈现仍由后续专卡实施，人的体验由之过手。

## 七格收口

目标＝桌面为产品宿主；监听回收＝中控已收入口Maker／Checker回执；证据＝固定版本官方源码＋安装器与启动器读回；验收＝`ACCEPTED_LIMITED_ENTRY_AND_CONSTRAINTS`，证据 `evidence/local/20261021-desktop/checker/final-review.json`，不含插件兼容；入档＝本卡与 evidence 指针；记录＝不提交／推送／合并，不调用模型；后续＝0.2.1插件兼容与实际桌面加载已由兼容子卡独立限定接受；正式前端、真实Run和人的体验另行推进。
