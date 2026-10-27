# KONT-RUN-011 · Flash单次真实试跑

授权：2026-10-23之先确认单次真实模型试跑，随后明确“ds flash 费用上限3元”。沿用该授权，不再重复索取；仅一条受控真实生成请求，不授权安装／在用Desktop改写、切换身份、push或合并。基线53da613。

既查：复用RUN-010内部纵切与生命周期屏障；缺口是constraints摘要此前仅为调用者提供值，尚未核准真实完整LLM请求。已读官方0.2.1 DeepSeek适配器：prepareCall返回generate闭包，生成POST在流消费阶段；account连接可能读取模型元数据。宿主已有账户grant、无API key；只读复用既有账户记录，不复制或打印令牌，不修改登录态。公开材料、独立测试store，人的产品入口仍为Desktop，不把隔离试跑当桌面部署。

准确模型为deepseek-flash（官方当前版本V4.1-Flash-1017）。官方中文计价页https://api-docs.deepseek.com/zh-cn/quick_start/pricing/于本轮读取：高峰缓存未命中输入2元／百万tokens，输出8元／百万tokens；上下文1M。保守按1,048,576输入tokens及256输出tokens估算约2.10元，低于3元。实际输入正文／wire严格限长、工具禁用、thinking disabled、maxTokens=256；强制整个试跑最多一个生成HTTP请求，拒绝第二请求／隐式重试，不以本地timeout声称费用撤销。计价变化则重新核实后再执行。

交付：在实际LLM stream边界收集完整JSON请求、真实messages/config/tools和Run/claim绑定，authorizeRequest默认deny；取消／超时／关闭后许可失效。核准与审计持久写入后才进入provider stream。根准备只读账户、官方适配器与最终wire核查的一次性runner；独立Checker先审代码／离线反例与具体单次执行方案，再由根执行一次。实际requestSha不再以旧伪摘要代替核准；所有凭据只留内存。产物与usage、请求摘要、唯一POST计数、官方真实终态、原子回流及正常重开读回共同构成证据。

Maker只做代码及synthetic反例，不自行真实调用；根承担模型／计价／账户连接核查与唯一实际调用，Checker保持独立。默认拒绝、实际上下文／route／tools变化、取消零stream，正常核准一stream；聚焦build＋受影响guard/integrated/request-gate，不全量。真实执行前代码未获独立预检不得调用。实际失败也不自动再请求，用同一已占位Run记录结果。

证据根：evidence/local/20261023-run-live；archive_id：kont-run-flash-live-20261023。未覆盖完整产品、在用Desktop装配、个人材料与强杀／断电恢复。费用报告区分按usage估算与服务端账单，不把本地估算当结算回执。

用户随后明确“分派子agent并行开发”：核心Maker已build＋focused21/21并冻结（最终消息曾因运行额度中断，证据文件已核哈希）；run_checker先复核核心，live_runner_maker并行完善一次性runner与必要离线wire验证，文件所有权分开。真实生成仍由根在两线独立预检汇合后唯一执行，不把并行授权扩成多次模型请求。

七格收口：目标＝实际请求核准及单次真实Flash闭环；回收＝两制作线冻结、独立执行前预检与执行后只读复核完成；证据＝evidence/RUN-011-INDEX.json与V/checker/final-review.json；验收＝ACCEPT_SINGLE_FLASH_RUN_LIMITED，无阻断，build／core21与wire4通过，15项冻结清单一致，未跑全量；入档＝本卡与STATE/QUEUE；记录＝一次本地提交，真实生成POST1，无在用桌面部署／push／合并；未决＝独立store验证并非正式工作站，未覆盖通用多用户执行权限、持久DSH恢复、断电或服务结算账单。

真实结果：deepseek-account/deepseek-flash，11条完整owned事件，completed，生成一块且provenance=[public-material]。输出“根据给定材料，Knot把材料、对话和产物关联到同一个工作现场。”；输入158／输出18／缓存0。请求审计hash、wire hash、log／output hash与实际KontStore重开字节均由Checker独立核对。按官方高峰价估算0.00046元，低于3元（非结算账单）；本次真人单次授权已消费1/1，不允许自动重跑或清除attempt marker。凭据原字节未变，未将令牌写入证据。
