# DESKTOP-021 独立复核

结论：**ACCEPT_RECORDED_PNPM_STORE_FIX_LIMITED**，无阻断；不接受生产部署或再次安装。

Maker manifest SHA `967b4e1c26aa58041cb1d97d11c6dd4e3aef83ce89ae68c1c1f118e9e71f6cc2` 与 **11/11** 冻结记录 bytes/hash 匹配。已独立核官方 bundled pnpm 11.28.5 完整源码 hash；其 storeDir 以 v11 结尾时原样使用、兼容检查要求 recorded store 一致，支持此次适配依据。没有 build 或全量。

独立聚焦 **9/9**，无跳过：解析1项含17负例及空私store junction拒绝，执行门5项，transport3项。真实官方 manager 在新临时空profile及既存file/link profile各安装一次，均offline/ignore-scripts，候选25文件匹配。既存recorded store、非Knot依赖可解析值和原选择保持；授权/permit/一次性占位/生产根隔离回归仍通过。这些是真实临时安装，不是生产安装。

helper 只读 bounded .modules.yaml，使用官方 YAML parser，拒绝重复键、alias、错误版本、非本地/相对/逃逸路径及重定向目录。既存node_modules缺manifest拒绝；空profile才允许已核私store。transport在manager调用前再次解析并比较recorded store与manifest hash，保持offline、禁脚本及原执行门。

另独立用官方Electron RunAsNode只读解析固定生产modules元数据，得到 **recorded-profile / &lt;drive-d&gt;/.pnpm-store/v11**，未扫描store包内容。前后modules/profile/固定现场hash保持；020旧claim、transport、uncertain result三文件hash也未变。未approve/execute、修改生产profile、启动停止Desktop、读取凭据/Session或调用模型。

这是针对ERR_PNPM_UNEXPECTED_STORE前置条件的修复候选，不保证完整生产依赖图、离线cache或后续manager步骤必成功。只支持已核的pnpm11.28.5本地v11布局；其他版本/布局默认拒绝。原020失败历史不能改写，不能清claim重试。本卡未审022未完成文件；后续任何真实安装仍须独立受理和新鲜证据。未声称renderer active、正常重启、人的体验或完整产品接受，旧协议覆盖口径不变。

证据：final-review.json、focused.tap、hash-check.json、hash-check.log、verify-evidence.mjs。
