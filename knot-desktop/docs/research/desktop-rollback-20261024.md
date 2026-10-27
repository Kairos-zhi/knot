# Desktop 旧代码回滚候选

来源为官方Desktop已安装的两个@kont包，不是旧file spec指向的当前仓库。DESKTOP-015既查实际旧库存为12个文件，当前DESKTOP-014升级候选为25个文件；二者承担不同用途，不能互补文件或重新build旧代码。

复用官方0.2.1-rc.2的本地bundle和peer兼容闸门、离线安装机制。旧bundle现有file:../dsh-plugin，plugin无额外dependencies；本次实际候选保留原package与代码字节，包括原peer范围。捕获器拒绝额外依赖、逃逸与未知库存，原package另存并逐项hash。后续若重定位，只允许bundle唯一plugin dependency变为同级file路径，必须记录原字节与转换，不替换源代码。

持久配置通过官方dsh-app-boot.readProfileManifest只读投影：@kont/desktop-bundle版本0.1.0、已选择，旧source指当前仓库。未连接live Host。独立Context的manager.listBundles缺少真实loader，返回operation-error，不能完成live库存查询；不伪造loader或开启调试端口来掩盖这一边界。配置选择不证明当前active。根进程观察未发现DeepSeek Harness.exe；本轮不据此自动启动桌面。

回滚与升级目录应整体保留各自兄弟依赖和可信manifest。实际更新前须重新核对installed旧代码、持久选择与本卡hash，确保无外部变化；再通过官方manager读取真实状态、检查待装spec。若版本／hash／选择漂移，先刷新回滚留样并复核，不盲装。

本卡只在新建临时profile中验证旧包重装和复制后runtime／renderer工厂，未执行生产数据降级。用户资产未被打包或回滚；新版本可能产生的新schema、Session或资产，不能因旧代码可重装就认定可安全降级。正式部署前需要单独确认数据兼容和正常重启安排，并使用已审升级候选spec；现desktop-host-client.mjs仍固定旧repo spec，不能直接拿来安装新候选。
