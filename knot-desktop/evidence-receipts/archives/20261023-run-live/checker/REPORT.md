# RUN-011 独立结果复核

最终结论：ACCEPT_SINGLE_FLASH_RUN_LIMITED。根已依现有授权执行唯一真实请求，Checker只读现有证据且实际KontStore init/read/close，没有创建executor或重发模型请求。以下旧预检作为历史保留。

- 冻结runner及核心/runner manifest仍匹配，process exit0。唯一generation POST=1，metadata GET=1，wire781 bytes，deepseek-account/deepseek-flash、thinking disabled、maxTokens256、工具0。actual request审计/授权摘要完整一致，wire与所有已批准system/developer/user输入映射一致；审计落盘先于生成attempt。
- 11条完整owned事件seq0到10，user-rpc/input准确、request/header/context/model route一致；assistant来源model/deepseek-account/deepseek-flash，usage输入158、输出18、缓存0、total176，对应completed turn/end。Run receipt.logSha与全事件hash相同，output hash与唯一generated块一致，provenance=[public-material]。
- Checker独立重开workspace并读回completed Run/产物，再关闭；文件字节不变，锁自然释放。凭据未变依据冻结runner在内存比较前后文件hash并断言true，Checker没有再次读取/复制/输出凭据值。
- 3元授权上限与执行前2.0992元保守上界保持；按官方峰值单价及实际usage估算0.00046元。该值不是服务端结算账单，settledInvoiceVerified=false。

只接受此单次公开材料真实模型纵切；没有在用Desktop部署、DSH Session持久化、完整产品或人的体验接受。没有扩大为任意材料/重复执行授权，原断电/生产恢复/Provider通用重试等限定不变。预检21+wire4未重跑全量，结果核对只做现有证据hash、关联与正常存储读回。

证据：final-review.json、verify-live.mjs、live-verification.json/log和live下既有完整运行证据。无剩余本卡范围阻断。

---

# RUN-011 独立执行前预检

结论：`PASS_PREFLIGHT_SINGLE_AUTHORIZED_FLASH_ATTEMPT`。只通过执行前预检；**未接受真实Run，Checker未发真实生成请求**。根可依既有用户单次“ds flash／费用上限3元”授权执行冻结runner一次，失败或不确定也不得自动重跑／删除标记。

独立构建、核心聚焦21/21通过；runner wire聚焦4/4通过，含真实官方DeepSeekAdapter serializer到拦截fetch的离线验证（网络／凭据0）。独立Electron `--check`有check-only输出、generationPosts=0、既有账户可用。核心与runner两清单共15项、7份产品／测试哈希一致；runner SHA256=`a97ce9e8113cfeef5f24f444203c8b5ee4f92f05deab7a2dc501b31689b14485`。无全量测试。

已审完整实际options／messages／header／context及claim绑定的JSON快照和摘要；默认deny，精确回签，取消与TOCTOU核准后／审计后重核，wx审计成功且紧邻next的同步verify后才进入stream。最终wire逐项绑定所有获准system/developer/user文本、route与256输出限制；thinking disabled、无工具／未知扩展／非text，目的地仅官方GET/models或POST/anthropic/v1/messages，无query/userinfo/hash及redirect。POST计数在首await前消耗，provider retry配置0，第二生成拒绝；wx脚本标记禁止重跑。

runner只内存复用既有deepseek-account-platform/default，桥不支持登录／刷新／写凭据，原始异常不输出，仅固定code。固定公开小材料、独立Knot存储；没有切换身份、在用profile／ASAR／Desktop部署或新增公共执行入口。既有sticky清理失败屏障保留。预检时attempt与generation-attempt均不存在。

已独立联网核对[官方中文计价](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)：Flash峰值输入2元／百万、输出8元／百万，1M context。按1,048,576输入＋256输出保守估计2.0992元<3元；实际request<=8192 bytes，wire<=32768 bytes。该上界不是账单结算；后续只读usage、事件、请求／wire哈希、store／产物与正常重开结果，区分usage估算和服务端账单。

证据：preflight-review.json、preflight-hash-check.json、build.log、focused.tap、wire-focused.tap、runner-check.log。待根唯一实际调用后另写结果复核；当前无预检阻断，完整产品／生产恢复／断电耐久等仍未接受。
