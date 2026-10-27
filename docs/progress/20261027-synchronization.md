# Knot 进度同步 · 2026-10-27

统一入口为根STATE/QUEUE；常用项目目录为后续开发入口，聊天隔离工作区保留同提交副本。完成同步须独立读回两目录HEAD与远端同步分支相同，不能把文档写好当作物理切换已完成。实际新提交与草稿PR见本分支Git/PR记录。

| 对象 | 已核事实 / 同步标准 |
|---|---|
| 048代码 | ed54934095a2788405d1c7839067735fe265807f，承接原main08a，精确300路径 |
| GitHub接入 | [PR15](https://github.com/Kairos-zhi/knot/pull/15)，main草稿/open/未合并 |
| 已核软件候选 | v3、26文件；pin7ac0e3ab13b680de16403bcf62ff290959bfdf9fa7024f804e6885f2e7308c18，源ed54934 |
| 官方验证 | 0.2.1-rc.2临时profile/offline；26复制/runtime8/workstation10/订阅清理0，临时目录已回收 |
| 独立复核 | 源门、候选执行门、发布读回通过；235/11/3及内含历史15不相加 |
| 本轮049 | 只更新六路径说明/根忽略规则与本地入口；不改产品，不重制候选 |
| 两处本地 | 常用目录持codex/local-sync-049及远端upstream；聊天副本同一同步提交detached；两处须clean |
| 历史保全 | 910旧忽略证据原地SHA不变；90运行文件只核元数据；695旧跟踪证据另做物理归档并保留a05/旧refs |
| main/在用软件 | main仍08a未合并，在用软件未更新；无模型或真实Session读取 |

048执行回执SHA256：`cb63af8f868ed43c243941f67c4c53d83a9dca6e73067cf53f7fc16d9a9ab2b3`；发布读回SHA256：`7f247b3e3f414ea3c65229c715c09def84eb5e597805337987de71cacab89d08`。本机冻结归档键为20261027-mainline-integration，049为20261027-local-sync-049，均位于本地忽略的evidence/local；运行资料不上传。

源门为ACCEPT_MAINLINE_DESKTOP_MODULE_INTEGRATION_LIMITED，候选执行门为ACCEPT_MAINLINE_MODULE_CANDIDATE_ISOLATION_LIMITED，均非完整产品接受。旧017不兼容、044固定d59、native/ReactDOM/真实App传输、人过手、G3/G4/G5与原终态/标题缺口保持。

下一步审阅主线接入；正式合并和生产更新按具体授权处理，本轮“同步”不自动包含。实施门见[049任务](../development/local-sync.md)。
