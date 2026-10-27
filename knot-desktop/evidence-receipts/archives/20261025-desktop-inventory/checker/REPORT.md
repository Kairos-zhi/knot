# DESKTOP-025 独立复核

结论：`ACCEPT_VERSIONED_DESKTOP_INVENTORY_LIMITED`。无阻断；接受本地工具版本化 inventory 与真实隔离验证，不代表根 checkout 发布候选或在用桌面部署。

最新 Maker manifest `69eb8be8...5c9ee4243` 独立复算一致；11/11 登记项匹配，其中 5 项产品/测试/helper、6 项报告日志。官方 bundled Node 独立 build 退出 0；聚焦 21/21，通过原相关 18 项与 Checker 自有 3 项，无 fail/skip。受影响 candidate、官方隔离安装、数据兼容、recovery 与 recovery preflight 均实际运行；git diff --check 通过，未跑无关全量。

维护性通过：旧 25 项具名冻结，新 26 项明确加 worksite-preview；verify 用普通 v1/v2 分支，不增加注册框架、DSL 或可变策略。CJS 官方 verifier 复用 mjs 的唯一精确清单/目录/字节检查，再承担 manager 版本与临时运行验证，消除原宽松正则的第二份 inventory。全部调用者已查；旧固定 pin 验证仍兼容。原 git 根、expected HEAD、受追踪及与 HEAD 一致的产品输入门没有放宽。

独立程序化检查补充自签反例：清单重排、重复路径、近似未知 v02 均拒；重算 checksum 不能替换外部可信 pin；额外空目录拒绝。真实 dirty root prepare 继续拒绝，没有产生真实发布候选。新 26 可重复、缺/多/变更/重定向及 format 混淆均通过既有聚焦检查。

真实旧 014 候选以原 pin `a1f00e43...5f1755a8` 只读核验，manifest 与全部 25 文件前后 hash 保持。去掉新增模块并改 format 的 synthetic 25 仅证明 inventory 形状选择，不证明它能运行或具有历史信任身份；历史兼容依据是真实原 014 候选及原 pin。无 pin 的一致性验证也不替代外部独立可信摘要。

独立实际官方隔离安装一次：新 26 项复制字节一致、index 实际 apply 成功，因此其新增 worksite-preview import 可解析；renderer factory 与槽注册成功；不兼容版本由官方 manager 拒绝。offline/ignore-scripts、enabled:false 和临时 profile 保持。该产物来自一次性隔离 Git fixture commit，不是当前 root 正式提交；无真实仓库提交。Maker 首次 symlink EPERM 与改用 junction 后的验证日志均保留，不需额外系统权限。

docs/api/desktop-candidate-formats.md 与 worksite-preview.md 增量已核对，历史 024 未覆盖与 025 v2/26 结果、信任 pin、fixture/root 发布边界写实。

未访问生产现场/profile/ledger、凭据或 Session，未启停/安装在用桌面、改变系统设置、调用模型或 root commit/push/merge。真实新发布候选、在用部署、active renderer、人的体验、完整 Run 与完整产品均未接受。
