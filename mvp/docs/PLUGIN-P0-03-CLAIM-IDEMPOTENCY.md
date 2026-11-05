# PLUGIN-P0-03：同步 claim 幂等归属

2026-11-03；Maker：本轮 Codex；独立 Checker：baseline_checker（不参与实现）；Human Gate：之。

用户要求核查 P0/P1 开工阻塞，无开工阻塞则正式开发。本卡只修复已确认的多 actor 写接入前置缺口；不据此启用真实多 Agent 或上线。基线为新 main `5a731a0e4509350ad0bc4e258cf903ffc83a81c5`，独立分支 `codex/p0-03-claim-idempotency`，不接管现有服务或数据库。

## 开工核对

PR49/F1、PR50/N1已合入当前main，新建库为1.6，front/已存在。PR51仍为afb53de文档草稿，旧1.4/未合候选描述须另卡追加修正后才可作为当前基线合入。P0-01路线/材料收口已完成，旧AGENTS/STATE/QUEUE中“本轮仅文档”对应上轮；本卡依据用户新的条件式开发要求执行窄修复。

当前http_server同步claim journal key只存body/value，重放不核actor；bundle_jobs已核actor+body。复用bundle的成熟行为，不另造身份系统。材料/宿主/旧库操作P0不作为本合成库修复的依赖。

## 范围

只允许改 `mvp/backend/http_server.py`、新增 `mvp/tests/test_claim_idempotency.py`、`mvp/docs/HTTP.md` 和本卡。不得改schema、契约JSON、bundle实现、冻结fixture、部署、凭据、共享环境或真实journal。不推送/合并/部署；提交后不amend/reset/force push。

## 行为与关闭条件

1. 新同步claim key持久保存服务解析的actor；相同actor/key/body返回原结果。
2. 跨actor同key或不同body返回既有400 BAD_REQUEST/idempotency_key_conflict，不返回原value，不产生事件/seq或修改journal。
3. 旧key缺actor（或值不匹配）拒绝重放，不猜local-user、不自动补授权/改写旧日志。旧记录只影响该key，不禁用其他新key；调用方核原动作后决定后续操作，不自动换key重发。
4. confirm/revoke/restore、同actor不同token、single-user、重启后均覆盖；token无效仍在HTTP鉴权层拒绝。
5. 用独立合成库证明旧实现反例，再修复并跑针对性回归、完整MVP测试、独立Checker。正文权限和逐claim写ACL不在此卡扩展。

## 当前状态

已完成候选修复：key 随原 journal 原子替换保存 actor，在现有服务锁内先核 actor/body，再决定重放；旧无 actor 的 key 拒绝重放。未扩展正文权限或逐 claim 写 ACL。

- 修复前新增 8 项全部失败，复现跨 actor 返回原结果及旧 key 被接受；修复后新增用例连同 authz、HTTP、跨窗口回归共 69 passed。
- 独立 Checker 直接运行新增 8 项及既有不信任自报 actor、最终 journal 写入失败用例，10 passed；另外实测并发两 actor 同 key 只有一个成功、重启后 token 映射变化拒绝、缺失/null actor 拒绝。
- 完整 MVP 回归为 500 passed、2 skipped、1 failed。唯一失败是基线 `front/README.md` 已带本机用户路径，触发 `test_repository_has_no_local_identity`；本卡没有改该文件，不将全量记作通过。另建发布卫生卡处理，失败日志保留。
- 首轮 69 项回归遗漏 HOME 隔离，既有两条导出测试生成了两份合成文件到默认导出目录；已按文件哈希及头部 db 指纹对应到各自临时测试库并保留。之后全量与 Checker 使用独立 HOME/USERPROFILE/basetemp。不能宣称本轮零 HOME 写入；未接管业务库或活动服务。

独立 Checker 对窄实现未发现阻塞；这只构成修复候选证据。完整回归、Human Gate、真实多 Agent 接入、用户体验与部署分别记录，未推送/合并/部署。
