# KONT-DESKTOP-017 Maker A · derived recovery

准备脚本基线d7e5702444e81443c78af353c1e6e49a4ba7d666。产物是derived-recovery-not-original-installed-rollback，不能称原015旧代码原样回滚。未提交，待独立Checker/Gate。

新增prepare-desktop-recovery.mjs及3项针对测试。固定核014摘要a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8与015摘要d5fe688ab0927f4badd46d6e4f9a3d2a78ea13529a91ecb7edca62e358647336，两原inventory/hash全部通过后，核src/kernel.mjs与lib/knot-model.js、snapshot.js、workspace-state.js四项逐字节一致。只从这两份已冻结artifact取字节，不读取当前产品源码或在用profile。

固定13项：015旧12项中的store.mjs换为014原字节，并增加014 run.mjs；其余11项保留015字节。旧UI/index/package/patch/peer均不改，不fork store，不复制任意未知字段，不重建冻结包。每项manifest记录sourceArtifact/sourcePath/sourceManifestSha256/sha256/bytes。format=kont-desktop-directory-recovery/v1，manifest明确派生身份和原始来源，不以原包0.1.0版本号伪造原样回滚；版本闸门无豁免。

输出保留兄弟目录布局，不可覆盖、不可与原artifact/源码输入重叠，不写profile或重定向路径，失败留.incomplete。verifyDesktopRecovery(dir,reviewedDigest)重新核两原artifact、四共用模块与精确13项source mapping，再核完整候选库存和逐字节相等；额外/缺失/篡改/错pin/错误身份/改source mapping均拒绝。

实际候选evidence/local/20261024-desktop-recovery/candidate，manifest SHA256 774c5c1d644ea529e660a405247e507ab0fd43e6ea8d621a4e469aa88994b42d，已将路径/摘要/验证API交B，最终本件完整校验也通过，见candidate-result.json。focused3/3：完整11+2来源与原peer/code保留、异目录可复现；覆盖/原artifact路径拒绝与额外文件/字节篡改/错pin；重算manifest也不能改派生身份或source pins/mapping。临时回收先核tmpdir父和固定前缀。

按卡未运行build，build.log明确NOT RUN，不冒称构建通过。未修改014/015/016证据、产品src/lib、vendor、在用profile或ASAR，未启动/退出Desktop、未模型/安装/提交。B负责数据五phase保留/claim防重/restore屏障与官方离线manager隔离安装，另列maker-b证据；A不以候选拼装或版本声明代替数据兼容/生产恢复通过。
