# KONT-DESKTOP-014 Maker A · directory candidate

源码基线3ccb26ffb6b1f80e313f0d657924460a6f38f446。已读开发基准、旧COMPAT A/最终限定回执、现bundle/plugin元数据；旧回执明确排除standalone wrapper tgz分发，因此本次不宣称两个tgz可迁移安装。

新增scripts/prepare-desktop-candidate.mjs及tests/desktop-candidate.test.mjs，无产品src/lib、vendor或在用安装改动。候选目录为evidence/local/20261024-desktop-package/candidate，packages/desktop-bundle与packages/dsh-plugin保留兄弟布局，bundle的file:../dsh-plugin按该布局落点；两个包仍0.1.0，仅候选副本peer窄到0.2.1-rc.2，manifest记录原range与转换。精确宿主声明不是测试通过/兼容已接受；官方manager实际复制解析由B独立隔离验证。

明确白名单25文件：bundle package/patch、plugin package及当前server/query/run/renderer源文件与4份build产物，含新Run状态面板。只读这些已跟踪且与expected HEAD一致的产品文件，不递归复制仓库。无凭据、用户资产、evidence、tests、private、node_modules/profile。记录sourceBaseCommit、sourceSha256、候选sha256/bytes、版本/peer/dependency解析、稳定manifest.json及其精确字节manifest.sha256；无时间戳/绝对路径进入manifest，异目录产物摘要相同。

CLI：node scripts/prepare-desktop-candidate.mjs <new-output-dir> <expected-base-commit>。输出父目录须已经存在且未被symlink/junction重定向；输出本身必须不存在，拒绝源码树/祖先重叠及profile/node_modules/.git位置。逐项源文件须regular且无重定向。成功前保留.incomplete，失败不删除或重写部分目录。verifyDesktopCandidate(dir,expectedManifestSha256)校验整体摘要、精确inventory、每文件字节/摘要，拒绝符号链接、额外文件/目录及篡改。没有npm/pnpm、网络或安装副作用。

当前候选已自核25文件，manifest SHA256 a1f00e43e8644e9b34215c159b793b9be07cec7a403900e1a7840b575f1755a8；详见candidate-result.json。build exit0（现有tracked lib字节未变），focused4/4：packager3＋原bundle加载1。覆盖双目录可复现、相对依赖、exact peer、原包字节保留、旧输出拒绝/原manifest不变、错误base/路径重叠/父junction拒绝，以及候选篡改/额外private文件/node_modules空目录拒绝。

已与B协调file:绝对bundle目录＋离线官方manager隔离profile验证，A未执行该安装、模型或宿主操作；不把B早期探路替代最终candidate验证。Maker未提交、未自验收、未改STATE/QUEUE/README或历史证据，待独立Checker/Gate；在用Desktop部署仍未授权于本卡。
