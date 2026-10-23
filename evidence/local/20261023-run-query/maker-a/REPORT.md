# KONT-RUN-012 Maker A · Run只读查询

基线fcc3df54ece7d39f7c0999837df0d32d4f891d0b。A线仅改index.mjs、新增run-query.mjs与run-query.test.mjs；未提交，待独立Checker/Gate。

复用KontStore同一snapshot、Run原有终态/dispatch语义及caller认证。projectRun严格八字段：runId/requestId/sessionId/targetId/worksiteId/phase/hasOutput/blockId。status completed是唯一completed且hasOutput=true；submitted只表示已提交；reserved/uncertain均投影uncertain，无claim为prepared。completed记录只指向已有产物ID，不保证当前目标块未被后续删除。纯投影不输出prompt/materials/哈希/dispatch controls/actual审计/金额授权。

GET /kont/runs返回{ok:true,seq,runs}；GET /kont/runs/<encoded runId>返回{ok:true,seq,run}，每次读取同一份store.read snapshot。详情仅decode一次，支持单个编码身份（含编码斜杠/百分号/中文）；未知/空/多路径返回404，畸形编码400。所有写入method返回405/Allow GET。沿用原caller、browser connection以及Agent Bearer/loopback Host/Origin fence，没有新增授权绕路。apply注册官方segment prefix /kont/runs；只读查证installed dsh-host-webserver register/match的prefix行为，不改宿主安装。

自测build exit0；focused8/8（新query3、既有protocol4、Cordis生命周期1）。覆盖全部phase/脱敏字段、空Run集合、list/detail/编码身份/错误路径、认证和GET-only/恶意Host/Origin/nonloopback，以及查询前后存储字节不变、零新事件。生命周期仍释放全部路由和store锁。测试是SYNTHETIC Run与本地HTTP/Cordis服务层验证，无真实模型、用户Session、profile或部署。

跨线契约已告知B线，未改client/样式/B线文件/readAudit scope/vendor/历史证据/STATE/QUEUE。新只读查询属于Knot扩展，不计作旧冻结协议5/16覆盖提升。人的工作站体验、桌面装配和模型执行不在A线交付内。
