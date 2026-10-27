# KONT-WORKSTATION-029 · 工作站响应接纳边界

2026-10-25，之“持续推进”，沿用子Maker/独立Checker。先读baseline/STATE/QUEUE、028回执、client api/refresh/mutate/Workstation、resolveRunOutput、build及store无事件不增版本契约。旧共享snapshot/workspace验证负责完整内核，依赖服务/ESM构建，不为这张卡另造完整schema浏览器副本；本卡只补客户端实际读取字段的可用性与已保存草稿确认。

问题：workspace HTTP200可解析JSON不等于可用快照。null/空对象/缺活动现场等在refresh先emit后崩溃；mutate还可能先清本页draft才发现坏响应。028已处理网络/HTTP/JSON失败，尚未覆盖此边界。后端既有乐观并发/唯一事实源保持，本卡无新竞品机制采纳；前端依已有设计“真实状态/连续性/错误可处理”。

目标：普通具名纯接纳函数置于现client.cjs，在api返回前检查，拒绝时沿028固定读/写失败与恢复屏障，不emit坏data、不清draft、不显示假保存。只检查render和定位产物实际依赖字段：非负安全整数revision/seq，assets中的id/title/summary和可选blocks的id/content，workspace活动身份确实存在，worksites的id/draft/checkedIds/excludedIds，presentations实际读取的id/worksiteId/kind/closed，以及各现场titles字符串。身份非空并消除同类重复ID歧义；标识数组是字符串数组。具体optional兼容按既有数据与测试核对，不把示例缩减DTO误当全store schema。

保留未知字段，不trim/normalize/重排/补默认/重建快照，不校验未读取的完整Run journal、边、provenance或业务权限；不把不认识的额外字段当失败。不新依赖/产品文件/构建模块/inventory。对已知snapshot，较低revision或seq拒绝；相等允许（store无事件操作可不增加），不要求seq等于revision。

写响应须先接纳，再核本次发送的worksite.update草稿在相同id现场中与捕获文本相等，才允许清captured dirty；缺失/不符视为结果待核对，保留全部本页draft和最后已知data。仍沿026按值清理以保护保存中追加的新文字。这是当前草稿回执确认，不是完整命令幂等或所有业务动作效果验证；不自动GET/重POST/回放。合法读可含其他窗口更新的draft，不以本页dirty否决读取。

允许client.cjs、build生成lib/client.js、新tests/workspace-response-client.test.mjs，必要helper/旧测试仅修真实接缝，不弱化旧026–028断言。根文档/状态/卡。maker先报实际optional决策；需要其他产品文件/全schema/后端/样式则先报根，不扩。

验证真实built factory/hook/组件回调及新接纳函数（可导出用于窄检查），非截图模拟点击。初始/刷新/写响应null、数组、空对象、缺活动site、坏标题/材料/blocks/勾选数组/presentation、重复身份/非法或回退版本；新未知字段保持，合法旧读取DTO/相等版本兼容；错误不清known data/draft/dirty离页保护；写回同id草稿缺失/不符不被当保存；刷新后显式再保存/较新编辑保护、无自动重试。回归026–028/旧draft/runpanel/bundle及store。旧014pin25/current26只读保持，无正式根候选。

角色Maker=workstation_maker，独立Checker=deployment_checker，根Gate。证据evidence/local/20261025-workspace-response，archive_id=kont-workspace-response-20261025。当前ACCEPTED_LIMITED。无生产data/profile/凭据/Session、模型、系统/桌面启停安装、真实root提交推送合并；只接受源码/构建/程序化语义，不接受正式Apple/浏览器/人体验或在用部署。

独立Gate=ACCEPT_WORKSPACE_RESPONSE_ADMISSION_LIMITED，无阻断，人类维护性通过。9/9制作冻结项匹配，独立build退出0；聚焦42/42（本卡8＋相关旧31＋Checker自有3），无失败/跳过。初始/读取/写入坏DTO矩阵、版本独立floor、全部草稿先核echo、未知字段原对象保持通过；跨材料块id局部唯一、空白包围身份保留、其他现场相同文字不能确认原草稿。旧028只修成功POST fixture真实echo/版本增加，原断言保持。旧014原pin25/current26保持。

七格收口：目标＝workspace可用响应接纳与原现场草稿确认；回收＝子Maker冻结/独立Checker完成停写；证据＝AN与WORKSTATION-029-INDEX；验收＝源码/构建/factory与组件语义限定接受；入档＝kont-workspace-response-20261025；记录＝本卡/STATE/QUEUE/API/README/控制回执；未决＝完整store/命令效果/幂等、跨重启草稿、正式Apple体验、正式根候选与在用部署。开发不续用生产/模型/系统/提交推送合并授权。
