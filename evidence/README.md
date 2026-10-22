# 本地交接证据

`INDEX.json`逐文件登记路径、字节数、SHA256和入库／仅本地原因。`include`条目保留原字节并显式加入Git；8份私有飞书原文片段留在本机，不提交正文。原文未删除，索引保留其哈希。运行目录、认证文件与安装目录不在仓库内。

历史冻结清单记录历史候选，不覆盖成新版本。桌面接受以`local/20261022-desktop-compat/checker/final-review.json`为准；收口新增只读ASAR注释和契约测试由独立收口回执另行审查。

固定源码与证据按字节验真；根`.gitattributes`防止Git自动换行转换改变SHA256。旧协议fixture自身约束LF，和上游固定blob一致。

自引用说明：单次commit后生成的`local/20261022-desktop-compat/controller/commit.json`及最终`receipt.json`留在被忽略目录，记录完整commit SHA和真实干净状态。入库交接摘要见`docs/handoff/20261022-closeout.json`；在新checkout以`git log -1`解析提交锚，不重造commit SHA。

新机器仍需已有DSH外部运行库才能跑完整桌面兼容测试，不能把本机运行接受外推为任意机器已安装。公共原服务fixture可独立进行协议对照，不需要另一份原仓库checkout。
