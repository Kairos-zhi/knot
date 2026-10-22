# KONT-RUN-006 Maker 候选

只加插件绑定：`apply(ctx,config)` 在同一 KontStore 上注册 `ctx.kontRunObserver`；受信config仅取hostVersion/Session/persistence/authorizeRead，readRun固定取插件store，传入同名覆盖函数不会调用。默认无读许可，不自动观察，不新增HTTP或执行／回流。

新绑定随插件卸载先closed并abort在途，同时等待异步unprovide和所有观察settled；唯一storage effect按protocol.dispose→观察解除/句柄释放→store.close执行。该屏障先于服务注册登记；真实Cordis服务重名抛错也走同cleanup，锁自然释放。旧引用卸载开始后拒绝，外部signal继续有效，卸载异常脱敏。

构建exit0；受影响focused **12/12通过**、失败/跳过0，见build.log与focused.tap。未跑全量。包含真实Cordis注册/撤销、默认无I/O、同store不可覆盖、外部取消、async卸载拒绝sanitize、注册冲突释放锁、原生命周期与RUN005负例。复用官方Electron/Session/JSONL原worker加绑定验证：官方库合成Session，无真实模型；注册0会话读取，在途观察取消，read及close人为闸门期间store锁保持，handle close后卸载才完成，服务撤销/旧引用拒绝，Session与Knot文件字节保持。

首轮worker在调用fiber.dispose后的同tick立即测试旧引用，Cordis尚未进入storage disposer，该观察正确被随后取消；测试改为等待观察abort事件确认卸载已进入屏障，再断言旧引用CLOSED，未增加时间等待。历史RUN004/005冻结manifest不改；本次对index/worker的变更在新manifest记录。

未改UI/vendor/观察策略/在用桌面profile和安装字节；未读真实用户Session/凭据，0模型调用，所有观察executionAuthorized=false，未提交/push/merge/部署。实际生产宿主配置、真实Run和人的体验未覆盖；交独立Checker，Maker不验收。
