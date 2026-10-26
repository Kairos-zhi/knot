# 桌面目录候选格式

用途是核对本地双目录候选的组成与字节，不代表生产安装许可。任务与证据范围见[025任务卡](../tasks/KONT-DESKTOP-025.md)。

| manifest.format | 精确组成 | 用途 |
|---|---|---|
| kont-desktop-directory-candidate/v1 | 历史25文件 | 继续核验旧014冻结候选；新prepare不再生成此格式 |
| kont-desktop-directory-candidate/v2 | 旧25文件＋src/worksite-preview.mjs，共26文件 | 新prepare生成，包含024共用供给预览模块 |

两种格式都保持packages/desktop-bundle与packages/dsh-plugin同级，保留file:../dsh-plugin依赖。manifest声明精确宿主0.2.1-rc.2，不豁免版本检查，也不是独立tarball或便携包承诺。

## 维护位置

`scripts/prepare-desktop-candidate.mjs`集中维护清单与核验：LEGACY_DESKTOP_CANDIDATE_FILES是冻结旧25项，DESKTOP_CANDIDATE_FILES是当前26项。核验只通过明确格式分支选择清单；未知格式、版本与清单混淆、缺失、多余、改字节或重定向都拒绝。

`scripts/verify-desktop-candidate.cjs`在使用官方manager做隔离检查前，调用同一份清单/目录/hash核验，不再另维护一套正则与文件数量规则。外部可信的expectedManifestSha256仍是判断“这就是已审候选”的依据；候选自己重算checksum不能替代独立pin。

新版本需要新增文件时，先登记对应格式的精确清单和兼容测试。不要直接扩掉历史清单，也不要从任意manifest反推允许的文件集合。旧候选原目录、manifest与pin保持。

## 输入与测试边界

prepare继续要求源目录为git根、expectedBaseCommit等于HEAD、全部产品输入受追踪且匹配该提交。工作树未提交时继续拒绝，不增加allowDirty或默认忽略项。

025测试把当前真实产品输入复制到新建临时git fixture，使用仅该fixture内的提交固定测试基线，验证v2可重复制备与官方离线隔离安装/复制后模块加载。这个sourceBaseCommit属于fixture，不能把它标成真实checkout的发布提交。

真实checkout仍需先按授权完成提交和源码冻结，再制备正式新候选；候选独立复核、生产安装许可与正常重启检查另行执行。隔离通过不代表当前运行的桌面已经更新。

031另补显式的[安装副本工作站集成检查](installed-workstation-check.md)：只在此次隔离复制包上连接服务和客户端行为，不改变v1/v2清单、默认核验或正式候选输入门。具体通过状态见任务卡。
