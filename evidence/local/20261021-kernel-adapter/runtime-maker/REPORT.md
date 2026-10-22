# KONT-KERNEL-001-B Maker 回执

状态：候选自核验通过，待独立 Checker；未提交、未发布。

- 改动：启动器改为同进程 runCli，沿用 DSH 官方 SIGINT/SIGTERM 关闭；overlay 对齐真实 web-runtime，并显式 --no-open；支持临时 KONT_RUNTIME_DIR 和 port 0。仅 fork+显式 KONT_DEV_IPC 时提供 IPC 停止桥，父连接断开也走官方关闭。
- 草稿：离开提示按草稿与当前持久状态的实际差异判断，改回原文不再警告。没有扩展 UI、样式或前端业务能力。
- 新增测试：runtime-draft.test.mjs、runtime-launcher.test.mjs。四个候选文件最终 SHA256 见 files.json。
- 程序化结果：3/3 通过。真实 DSH 临时 profile 启动两次；写入草稿→SIGTERM→正常退出→锁自然消失→同路径重启→读回草稿→再次退出锁消失。没有删除锁来制造通过。
- 初次实际运行发现 host 异步 dispose 回调未被等待，已报告中控，由 A 在后端文件域改为 effect 的异步 disposer；失败日志保留 runtime-tests-01-lock-failure.log，修正后全量结果为 runtime-tests-02.log。
- 临时目录由测试 mkdtemp 建在 D:\tmp，退出后清理；进程盘点确认无本测试 dev.mjs fork 遗留。现有 3081 实例未停止、未更改。
- 限制：验证了官方进程内 SIGTERM 路径，没有模拟物理键盘 Ctrl+C；未覆盖断电、强杀后的陈旧锁恢复；不接受工程或产品。