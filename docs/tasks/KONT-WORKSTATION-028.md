# KONT-WORKSTATION-028 · 保存失败与显式恢复

2026-10-25，之“继续推进，开子maker”。027已独立限定接受；本卡补工作站可靠连续性，不扩旧表单业务。仅开发/隔离程序化验证，无生产/模型/系统/桌面启停安装/真实root提交推送合并。

既查：development-baseline、STATE/QUEUE、026/027回执、当前client的api/refresh/mutate、store revision冲突与createHandler、既有docs/design/principles.md（2026-10-17 accepted-core-publish来源）错误可理解可处理/状态先可靠。后台沿用已研究的共享内核/乐观并发/不重放机制，无新竞品工程建议或后端改动；前端落实已有连续性，不另定外观。当前api直接把服务message或fetch异常显示，写入网络/JSON失败无法证明未落盘。

目标行为：workspace API失败使用固定本地文案，不透传后台message、错误对象、路径或响应正文。409且STALE_REVISION为明确冲突；401/403为连接拒绝；其他HTTP/网络/不可解析JSON按读取/写入区分。写入无法确认时明确“结果待核对，请刷新”，不能说未落盘/数据保持/可安全重试。状态栏有workspace错误时不显示已保存成功。

失败保留已知data/seq及本页draft Map，清预览/运行产物仍按026既有失效规则。不自动刷新、重POST或回放命令；有workspace错误期间阻止全部mutation直调及界面提交，明确保留可用的刷新/重新连接与返回对话；草稿仍可编辑。刷新成功才解除写入屏障，刷新本身只有GET、不重放；仍保留各现场本页dirty。刷新失败不能解锁。刷新后显式保存才按最新revision提交当前draft，旧失败不能把较新草稿删除。不得把刷新当作证明未知命令到底是否执行的完整回执。

维护性：普通具名错误映射/现有error状态与早返回；优先用现error作为恢复屏障，避免新增通用错误框架/异常类/状态机/平行store。业务失败/权限规则仍由后端负责。refresh与mutate职责清楚，不复制后端完整schema。读取HTTP错误不必信任其正文；409分类只读已解析固定code，不信任任意message。错误状态不会隐瞒保存未知结果。若刷新后旧现场已删除，本页draft不能迁移/删除，孤立draft仍需离页警告；不新增现场恢复UI。

允许：packages/dsh-plugin/src/client.cjs、tests/workspace-recovery-client.test.mjs、必要tests/helpers/workstation-client-fixture.mjs，build生成lib/client.js。只因现行为必要测试接缝可改旧测试，原026时序断言不弱化；其他产品文件/依赖/style/build/inventory/后端不预授权，必要则报根。根维护文档与状态。

验证：实际built factory/注册组件hook及回调，非模拟点击/截图。冲突、401/403、500含私有正文、网络异常、无效JSON；错误文案/状态栏诚实、失败不清draft/data/seq、错误时直接重复动作零POST、刷新失败仍阻止、手动刷新GET零重放、成功后显式保存最新revision/较新draft；新增现场或材料命令未知结果也不自动重放；错误遮蔽旧preview/产物。回归026/027、draft/run-panel/bundle；保持旧014pin与当前26清单。可以隔离服务测试既有409契约，不读真实data。

Maker=workstation_maker；独立Checker=deployment_checker；根Gate/入档。证据evidence/local/20261025-workspace-recovery，archive_id=kont-workspace-recovery-20261025。当前ACCEPTED_LIMITED。限定源码/build/组件语义，不接受浏览器/正式Apple工作站/人的体验或在用部署。

独立Gate=ACCEPT_WORKSPACE_RECOVERY_LIMITED，无阻断，维护性通过。8/8制作冻结项一致，独立build退出0；聚焦34/34（本卡8＋相关旧23＋Checker自有3），无失败/跳过。原026十项与027五项断言保持。自有检查覆盖无dirty未知写入后的延迟刷新中性状态/旧callback拒绝、非409伪冲突body不读、孤立draft离页警告与原id重现后仍取回。旧014原pin25/当前26清单保持。

七格收口：目标＝保存失败与显式恢复；回收＝子Maker冻结/独立Checker完成；证据＝AM与WORKSTATION-028-INDEX；验收＝当前provider内存草稿/源码/build/组件语义限定接受；入档＝kont-workspace-recovery-20261025；记录＝本卡/STATE/QUEUE/API/控制回执；未决＝未知历史命令完整幂等、跨重启草稿、孤立草稿恢复UI、正式Apple体验与在用部署。无生产/模型/系统/真实root提交推送合并。
