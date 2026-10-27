# DESKTOP-020 独立复核

结论：**CLOSED_FAILED_INSTALL_PRESERVED**。唯一获授权安装失败，未重发；不接受升级或生产部署成功。

执行前只读预检已确认精确 HEAD 4b818873893ce5d32b2f3d6cd7a88e657c4178fd、019 主 manifest 12 项、014/017 候选及 descriptor 928f2873…77a9 均匹配。原固定数据、profile、旧安装12项一致，无进程/原锁/生产claim。Checker 未 approve/execute，实际安装仅根执行一次。

根回执与实际保留 ledger 一致：acquired=true、state=uncertain；manager application=failed、changed=false、package exit=1、operation-error。只分类读取官方 pnpm.log 得 **ERR_PNPM_UNEXPECTED_STORE**，记录日志 hash，不披露 raw log、URL 或 token。不能把 failed/uncertain 解释成安装成功。

独立失败后读回，以及根普通启动后的再次读回，共同确认：profile SHA `074125faf53fc9832aa075e35617adfa773806a6321dc0267b9e969d0e9d5283`、固定数据 SHA `e0359bb66a44a41c082ab12c845cbea6a70435e5c9d6f7bc641277a16c3c79ac` 均未变；旧 installed 12/12 与原来源匹配，完整 @kont 库存仍12项，无新增/部分新版代码。profile 原字节不变也证明非Knot依赖声明及选择未变；未全量核所有非Knot node_modules 或缓存内容。

生产 claim 保持 reserved，result 保持 uncertain，独立 transport marker 存在；普通启动前后这三个文件字节相同。没有删 claim、重试或清占位。原失败后 JSON 是启动前无锁/无进程快照；根正常启动后重复该旧阶段检查因新锁正确停止，拒绝日志保留为 post-failure-refused-after-launch.log，不把该时点变化冒充产品故障，也不改写先前证据。

根通过普通入口打开未升级 Desktop 后，Checker 独立看到 **5个官方路径进程、debugFlag均false、原 data lock 新出现**。同期原profile/data/旧12项仍相同。这里只接受普通进程与锁的启动证据；没有验证 renderer apply、live插件active库存、升级包生效或人的体验。Checker 未启动/停止应用、连接调试端口、读凭据/Session或调用模型。

后续问题是实际profile的包管理器store绑定与所用store不一致；本卡仅有固定错误分类，不在此修改生产store或重装。任何修复/后续真实执行应另行受理并重新核绑定，不清除现有reserved/uncertain标记来重发。原一次失败与未部署成功事实必须保留。

证据：final-review.json、preflight-review.json、post-failure-review.json、normal-startup-review.json、对应只读脚本和日志。根的实际install-result与普通启动证据另见controller。
