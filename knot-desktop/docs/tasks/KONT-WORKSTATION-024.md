# KONT-WORKSTATION-024 · 共用现场供给预览

日期：2026-10-25。授权：之“稳步推进开发”，并明确“确保后端代码可维护，以人类能够维护的标准写代码”。本卡只开发和隔离验证，不安装在用桌面、不动用户现场、不调用模型或修改系统设置，不提交/push/merge。

目标：给正式工作站和Agent一个共用、只读的现场供给预览。保留KontStore.preview既有形状与行为，用一个清晰命名的纯函数承接投影；新GET接口从同一次store.read取得seq与预览，不另建store或编译/执行入口。

既查：已读开发基准、STATE/QUEUE、旧五阶段/G门/W0–W6、设计原则、RUN-012/013，当前store.preview、run.prepare与client.reveal。现有preview已按checkedIds顺序并排除excludedIds；run输入还含独立来源/请求摘要，本卡不强行合并不同契约。旧源码与已安装候选保持。后端依据复用docs/research/20261021-backend-seeker.md固定版本OpenCove command/query共享控制面的既有研究，只适配其明确owner与查询模式，不引入框架或竞品代码；非全域远端母本检索。前端按Apple工作在前、同对象连续性、查看与供给分开，本卡只提供契约，不扩旧表单或另定视觉。

最小范围：

- 新模块packages/dsh-plugin/src/worksite-preview.mjs，导出createWorksitePreview(state, worksiteId)，输入为现有store已验证状态，输出保持{worksiteId,draft,materials:[{id,title,summary,blocks}]}；不暴露未供给或其他现场材料，结果与输入无可写别名。
- KontStore.preview只读一次后委派同一纯函数；保留NOT_FOUND/404，不改运行、保存、锁、schema和旧调用者。
- GET /kont/worksites/<一次编码的worksiteId>/preview，返回{ok:true,seq,preview}；GET-only，同现有认证/Host/Origin规则，未认证不得读store。身份可含编码斜杠/中文但不双重解码；缺id/多路径404，坏编码400/INVALID_WORKSITE_ID。
- 注册受限/kont/worksites/前缀路由；明确路径匹配，不扩大其他命令面。
- 只添加聚焦的行为测试：隔离/供给排除/顺序/完整block来源/返回值无别名，seq同次快照，查询不改字节或发事件，身份与路由负例，认证先于读取，方法拒绝；旧preview与Run query相关回归。

人类可维护性验收：模块/函数按业务命名，普通控制流；不增加通用路由器、命令总线、隐式注册表或配置DSL；只在已有边界解释为何，错误沿用KontError；代码审查须指出职责、输入前提、兼容与未来客户端接点。失败不能静默丢材料，不靠过量验证/一行巧技掩盖问题。

打包边界既查：package.files包含src/，但014目录候选工具固定25项，同时用于核验已审旧候选。直接追加文件会破坏旧25项验证，本卡不改该冻结工具/候选，也不生成新桌面包；下一张打包卡须版本化新inventory并保留旧25项验证。这是源码契约卡的明确限制，不将未部署源码称为新桌面能力。

分工：workstation_maker写上述产品文件与tests/worksite-preview.test.mjs及自身证据；根写任务/状态/归档；独立Checker不参与制作，读源码并用自有程序化检查复核。证据根evidence/local/20261025-worksite-preview，archive_id=kont-worksite-preview-20261025。流程Maker自核验→独立Checker→Gate→归档；人的界面体验不由这些测试验收。

当前：ACCEPTED_LIMITED，独立结论ACCEPT_SHARED_WORKSITE_PREVIEW_QUERY_LIMITED，无阻断。4项产品/测试及2项日志/报告冻结一致；独立build退出0，聚焦32/32（Maker新7＋旧相关22＋Checker自有3），未全量。

维护性独立通过：单一业务纯函数、store薄委派、协议负责认证/路径/方法/seq，无新增依赖/通用框架/平行store。保留旧形状、供给顺序、排除、getBlocks兼容；缺引用明确失败，深层blocks/provenance无别名；一次解码、认证与方法先于read、同次seq读回均有自有负例。API与维护位置见docs/api/worksite-preview.md。

七格收口：目标＝正式工作站共用只读供给预览；回收＝Maker冻结、独立Checker完稿；证据＝AI/maker、AI/checker与evidence/WORKSTATION-024-INDEX.json；验收＝上述源码/服务限定接受，不代验UI；入档＝kont-worksite-preview-20261025；记录＝本卡/STATE/QUEUE/README/API文档，本地未提交或推送合并；未决＝下一张候选打包需版本化inventory兼容旧25，再接正式客户端，不续用部署或模型授权。未接受正式UI、桌面部署、真实模型/完整Run、历史业务材料迁入、取消/恢复或永久网络修复。
