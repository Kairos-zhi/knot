# 049 · 本地与仓库进度同步

2026-10-27。用户要求进行一轮同步。沿既查→Maker→独立Checker→Gate→执行读回收口；本卡不修改业务实现。

## 既查与范围

常用目录停在047/a05，聊天工作区与远端接入分支均为ed54934；PR15为main草稿未合并。根状态尚未写入048实际候选/发布结果。已读取开发基准、048冻结回执、两工作树分支占用与忽略规则。

只改六路径：根.gitignore、README、STATE、QUEUE、本卡及同步进度页。根忽略规则定向补/evidence/local/与/.runtime/；其余678既有跟踪文件、产品26、核心/脚本/测试、旧回执与路线保持。无新后端机制或前端交互，不重跑构建或模型验证。

## 执行顺序与门

1. 从ed建立codex/local-sync-049，记录两处原HEAD/branch/状态及旧远端锚。
2. 910旧忽略证据逐SHA保全；90旧运行文件仅核路径/size/mtime，不读内容。旧695跟踪证据另做物理备份并核原字节，保留a05/旧refs；新归档排除于自身基线。
3. 独立复核六路径与678保护文件，再精确提交/推送并建对048分支的草稿审阅；main合并不在范围。
4. 对最终新提交的tracked/ignored/untracked做路径/祖先及重定向碰撞检查，不能复用ed目标结论。切换必须--no-overwrite-ignore；不可读、碰撞或预期外变化即停。
5. 聊天工作树先detach到同步提交释放分支，常用目录再普通切换该分支。禁force/reset/clean/ignore-other-worktrees，不删除本地资料。
6. 独立终读两目录HEAD与远端相同、常用目录branch/upstream正确、聊天副本detached、两处clean、910SHA/695归档与旧refs保持。90路径按下述r2分类核验，不称全部原元数据保持。执行回执记实际新SHA/PR，不自引用填写本提交hash。

## 边界

常用目录成为后续开发入口，聊天工作区是同提交副本。旧047与旧根证据路径按历史理解。软件候选仍为048 ed54934/pin7ac0…，文档同步新HEAD不代表重制/部署；主线审阅、生产更新、模型授权分别处理。

## r2 · 旧公开代码引用连续性

r1已提交35f6d42/草稿PR16并完成两目录切换，但post读回发现24逻辑源码路径失效，故未收口。原90路径中66真实运行路径元数据原样，24经.runtime内旧junction指向root/packages/dsh-plugin；leaf常规文件检查漏了祖先引用，原失败和源门留样，不改写为成功。

r2分支codex/local-sync-049-r2从35f6d42继续，源码仅改五路径：.gitignore、STATE、QUEUE、本卡和同步页，其余679跟踪文件不变。根精确忽略/packages，仅供本机兼容junction；主代码仍是knot-desktop/packages。旧packages必须lstat为ENOENT才可创建固定junction到同一primary的canonical路径，任何现存对象/重定向均拒绝覆盖。

不修改.runtime及D盘已有链接或内容；24路径须最终realpath落唯一新plugin，公开26文件经canonical/兼容入口核ed/a05原字节，仅纯import normalizeSnapshot，不new Store、不apply/启动DSH。66路径核原size/mtime，24只记录新代码checkout时间，不伪恢复mtime。910证据和695归档照常核SHA。新commit/push/草稿PR、最终碰撞/两tree同步及独立终读后才收口。
