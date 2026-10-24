# KONT-DESKTOP-015 Maker A · installed-byte rollback

准备代码基线338ef08b57b2f29859df77cbf0e85f1f115f39bb；回滚代码来源是实际已安装副本，不是该仓库基线。已读开发基准、014装配研究与两个既有候选脚本。只读profile/package.json及已安装@kont两个代码目录，不读Session/凭据/provider，不改profile/ASAR；本轮未启动或退出Desktop，不声称App当前活跃。

真实落点：D:/DSH-Desktop/home/profiles/desktop/node_modules/@kont/desktop-bundle与@kont/dsh-plugin。旧profile spec仍指当前仓库目录，不能作为旧代码回滚来源；脚本以createRequire(profile/package.json)及createRequire(installed bundle/package.json)的实际解析落点获取旧包，不沿旧spec读取仓库。旧实际库存12文件：bundle package/patch 2，plugin package 1、src 5、lib 4。plugin无额外依赖，bundle依赖实际已是file:../dsh-plugin，因此本次12项全部transformation=none、代码/package/peer/patch逐字节保留。

新增prepare-desktop-rollback.mjs及4项针对测试。固定旧12文件inventory；额外文件/目录、依赖/生命周期字段、peer漂移、相对依赖逃逸、resolver跨profile与symlink/junction重定向均拒绝。原package bytes另存original-packages两项；仅当bundle唯一plugin依赖是旧绝对file标签时允许副本内重定位为file:../dsh-plugin，代码与peer不动。manifest分别记录sourceSha256/产物sha256/transformation/originalPackages，复用兄弟目录布局，明确format=kont-desktop-directory-rollback/v1（014的25文件验证器不能直接用于本件）。verifyDesktopRollback(dir,reviewedHash)核完整库存、源package证据、唯一允许的重定位语义及所有字节摘要，B已按此接口导入。

输出不可覆盖，不写源码/profile祖先或重定向路径；失败保留.incomplete。最终脚本在任何输出写入前完整复核两个inventory和全部12源文件/metadata字节，发现采集中漂移即拒绝。当前已捕获件又独立读回全部12源字节及源库存，均与sourceSha256一致，profile package metadata hash未变，见installed-source-recheck.json；未覆盖重写候选。manifest SHA256 d5fe688ab0927f4badd46d6e4f9a3d2a78ea13529a91ecb7edca62e358647336。

构建exit0（产品src/lib字节未改），focused4/4：旧installed synthetic字节保留、不信repo spec、绝对dependency标签的唯一重定位、额外inventory/dependency/peer与路径逃逸拒绝、不覆盖和tamper验证。临时fixture回收先核绝对路径、tmpdir父与固定前缀。Node直接制作/校验；B的官方Electron隔离worker通过ESM import复用verifyDesktopRollback，实际官方manager验证单列maker-b证据，不能把普通fixture当真实回滚验收。

候选路径evidence/local/20261024-desktop-rollback/candidate；CLI node scripts/prepare-desktop-rollback.mjs <new-output-dir>。未运行包管理器、模型或在用Desktop部署；Maker未提交/自验收，待独立Checker/Gate。root负责旧bundle选择元数据，A只记录profile依赖标签与selected布尔，不把它当live fiber active证据。这里只保存代码回滚候选，不涉及用户数据恢复/删除。
