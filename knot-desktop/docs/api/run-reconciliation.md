# 已占位 Run 的显式终态对账

`ctx.kontRunObserver.reconcile(runId, { signal })` 与 `POST /kont/runs/{encodedRunId}/reconcile` 是显式写动作。HTTP只接受空JSON对象，复用原human连接或Agent bearer与Host/Origin认证；不接sessionId、path、events、receipt、force或调用者授权报告。旧observe仍只读，GET list/detail与8字段Run投影不变。

默认关闭。readAudit.enabled仍默认false；新增可选readAudit.reconcileGrants默认空。每个写grant仅含runId/requestId/sessionId/inputSha256，必须与当前Run精确对应；还需要原grants中的同一exact read许可；新取证回流另要求已批准的replay request fingerprint。旧只读grant不隐含写许可，装配与grant本身不触发任何自动读/回流。默认apply的HTTP返回403 DSH_RECONCILE_DENIED。

```json
{
  "readAudit": {
    "enabled": true,
    "grants": [{"runId":"run-id","requestId":"request-id","sessionId":"safe-session-id","inputSha256":"64-hex-digest","approvedRequestSha256":"approved-replay-boundary-digest"}],
    "reconcileGrants": [{"runId":"run-id","requestId":"request-id","sessionId":"safe-session-id","inputSha256":"64-hex-digest"}]
  }
}
```

示例digest仅作结构说明，实际值须为64位十六进制。replay fingerprint来自原只读observe摘要；它不同于executor actual-request gate摘要及claim.constraints.requestSha256。对账不把三者等同，不证明原执行许可、完整模型调用或计费；结果executionAuthorized/modelRunVerified始终false。

受理prepared且已有reserved/submitted/uncertain claim的Run。submitted取消后可能仍保留submitted，因为原settlement只接受从reserved转换；本动作可核对这种残留。无claim拒绝。已completed在有效读写双许可下只返回已有窄投影，evidenceRevalidated=false，不重新打开Session、不声称本次重新验证指纹。

新读取只点读原planned Session安全地址，沿原官方版本/header/narrow schema/replay/稳定性和已批准replay fingerprint检查，并核对provider/model/maxTokens与claim。raw events只在工厂私有链中保留；handle.close成功后，重新核对当前owner/signal、同run/request/session/input及claimId/constraints，再调用同Store.returnRun。source固定runtime:dsh-reconciliation，不能由HTTP替换Store或证据。

原returnRun提供目标CAS、完整证据关联及单产物幂等；同claim入队后的reserved→submitted/uncertain变化不撤销已受理完成证据，不新增Store阶段门。原子提交后取消不能回滚，以GET/journal事实为准。读/close阶段取消、dispose或真实close失败为0returnRun；writer入队后取消可已调用returnRun，但原Store信号屏障在提交前阻止commit。

对账使用原binding pending/closed/dispose与039真实cleanup brand屏障。真实close失败保持sticky、阻断owner安全关闭；普通许可、schema、CAS失败不sticky。并发/重试只生成一次产物；不释放占位、不重提模型。HTTP取消监听req.aborted及响应未完成的res.close，正常body读完不等于取消。

成功返回原{ok,seq,run}窄投影及evidenceRevalidated/executionAuthorized/modelRunVerified；不返回日志或输出正文。证据不完整、aborted/error、多轮、source漂移、许可/指纹/route不符或目标冲突时拒绝，保持原claim状态/相位，不强改uncertain或新增失败/取消持久态。

当前observer能审部分额外runtime-context user日志，但原returnRun要求单一用户输入；本卡只支持两验证器的交集。额外context仍拒绝，不删改/重排原日志或伪造完整log hash。不是所有真实取消/失联终态已闭环，也不代表真实Session/生产部署或人的体验验收。
