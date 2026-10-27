# Knot 本地与仓库同步 · 049-r2 收口

2026-10-27。本轮同步已获得独立终核限定通过，实际开发入口为常用项目目录；主线合并和生产更新不在本轮内。

1. 目标：常用目录、聊天隔离工作区与GitHub同步分支统一。实际最终提交958d0aab3049cde411f0fc79a85bb50ab5325dc9；primary持codex/local-sync-049-r2/upstream同SHA，managed同SHA detached，两处index/worktree clean。
2. 监听回收：中控制作，独立Checker做源/路径/保全/提交/发布终核；无新自动化、服务或模型。未启动旧测试运行环境或官方软件。
3. 证据：初始6路径35f6d42/PR16与r2精确5路径958d0aa/PR17均保留；旧048源、候选、执行和发布冻结不变。软件候选仍绑定ed54934、pin7ac0e3ab13b680de16403bcf62ff290959bfdf9fa7024f804e6885f2e7308c18，不能用同步HEAD冒充新候选。
4. 验收：r1切换后发现24逻辑公开源码引用经旧runtime祖先junction悬空，未收口；leaf检查漏祖先依赖的失败/诊断原样保留。r2固定root/packages junction指向唯一knot-desktop/packages，原runtime/D四链接不动；26公开字节同a05/ed，24引用恢复，66其余运行路径size/mtime原样。24源码checkout时间变化单列，不伪造90全未变。仅公开kernel纯import/内存检查，无Store/DSH/模型或runtime内容读取。
5. 入档：archive_id=knot-local-sync-049-20261027；检索键Knot/KONT/本地同步/049-r2/legacy-junction。旧910本地证据SHA保持；旧695跟踪证据在本目录legacy-tracked-evidence物理备份且保留a05/旧远端refs，原tracked路径随新布局不再保留。evidence-index.json登记本次归档真实hash，自身不纳入。
6. 记录：[草稿PR17](https://github.com/Kairos-zhi/knot/pull/17) base为049分支、1commit/5files，已attach；PR15/16及更早草稿/分支保持。真实目标684路径碰撞0，managed先detach、primary普通--no-overwrite-ignore切换，无force/reset/clean/amend或合并。独立execution回执SHA9376ee2d22938b6d88a126b7a5da3c03c5e407b715fc5e3eb093a897a796635c；publication回执SHA7510d35921b2979ba6b6014469b1221aa00b2cd5c48447d5081a446a9a15173a。
7. 未决：main仍08a，主线PR15与同步补充草稿尚未合并；在用软件未更新。G3/G4/G5、人过手、native/ReactDOM/实际App传输及旧终态/context/标题缺口保留。后续开发以常用目录根STATE/QUEUE为准；不再以旧047根状态当当前进度。
