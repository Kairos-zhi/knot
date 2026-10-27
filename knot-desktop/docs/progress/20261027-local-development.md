# 本地开发进度 · 2026-10-27

业务基线为已推送的046提交`81afa22a483baf6c2da4f9d45f29d5669acabf10`；本报告在`codex/progress-report-047`写回，报告本身的提交／PR以仓库记录为准。代码、正式本地候选和隔离验证已推进；本轮未更新在用软件、未重读生产profile或当前加载态，候选通过不能认定已部署。完整产品接受仍为0。

## 已完成的限定范围

| 单元 | 实际进展 |
|---|---|
| 033–037 工作站 | 资源库唤出复用、三态共享HUD、工作岛运行归属与返回、同Store文件夹契约及客户端组织；人和Agent共用对象／操作，未代验人的体验 |
| 038–042 五项修复 | 完整Store元数据导出／恢复／人Agent同义读；清理失败与owner关闭屏障；Run／资产同版本定位；登记呈现不虚构window；Core业务引用与Run／DSH身份域分开 |
| 043 只读配对 | 固定reader闭包和完整语义核验；原017对当前完整业务状态仍有损或拒绝，不能当兼容恢复包 |
| 044 写入往返 | 新B14恢复承载与该卡d59基线的A13入口，以真实HTTP和持久重开作A→B→A；独立build／36项通过，完整状态及journal保持，仅synthetic配对 |
| 045 发布基线 | 精确112路径一次提交`d59bcf29de1aeae80528357c0b48e80c62c322f8`并推送；真实HEAD制26文件候选，官方临时profile隔离验证及独立读回通过 |
| 046 显式对账 | 独立build／74项通过；精确11路径提交81afa22并推送。新26文件候选通过官方离线隔离验证，显式读／写双许可对账默认拒绝，不重发模型请求 |

这些数字来自各卡原回执，测试范围互有重叠，不求和为总测试数；本次仅文档整理，没有重跑build或测试。

046要求原exact读grant和独立exact写grant；新取证另须已批准replay指纹，只有取证close成功后经同owner Store回流。已completed在双许可下免Session IO，不冒称本次重验；未完成或不支持的证据保留原claim。旧observe仍只读，对账不代表执行／模型／计费许可，见[API](../api/run-reconciliation.md)。完整快照采用独立`kont-store-snapshot/v1`，`schemaVersion:4`仅表示Canvas核心，见[快照契约](../api/store-snapshot-contract.md)。

## 候选与恢复配对的区别

最新046候选源提交为81afa22，26项产品；manifest SHA256：

`321d8d309c6086250aafd579dd39478555d55cfa5b6b3037e601e2ca76634aa8`

官方0.2.1 RunAsNode临时profile的offline／ignore-scripts检查已完成：复制26项、runtime 8项、workstation 10项、清理后订阅0，原Checker独立读回。该证据不含浏览器native EventSource、实际dsh-app传输、ReactDOM或人的体验。

044恢复组合另有pin`43546de507584eca98b0a47ea19a7879ca331c4b52f012d8279f88d9f8ae7939`，证明绑定d59基线的A13／B14离线往返。046保留原Store／数据7项，并对固定旧来源作回归、对当前源漂移正确拒绝；不能把044结果改称81最新候选已完成新的恢复组合或生产迁移。旧017不兼容事实保持。

## 仓库审阅状态

| 审阅项 | head／base | 本次记录状态 |
|---|---|---|
| [PR #12](https://github.com/Kairos-zhi/knot/pull/12) | 045 d59／codex/kont-dsh-baseline-045（45ccd24），仅审阅 | draft、open、未合并；1 commit／112 files |
| [PR #13](https://github.com/Kairos-zhi/knot/pull/13) | 046 81afa22／045 d59 | draft、open、未合并；1 commit／11 files |

main仍为独立历史`08a2a5340edab920ce942173ba63b2c5bc369eb4`。PR12不是针对main的集成成功，PR13也只审045之上的增量；没有合并、拼接或重写历史。当前报告按046为父基线继续文档审阅。

## 剩余顺序与边界

1. 完成本报告的独立复核和文档提交／推送，审阅基线为046；main历史集成另行定范围，不能自动合并。
2. 以最新候选制定具体部署／完整状态恢复绑定方案，取得相应授权后再做真实Desktop／G3、native传输与人的体验验证。本轮未更新在用软件，当前生产加载版本未重新核实，不因隔离通过跳过授权和恢复检查。
3. 再接稳定Codex／Hermes双端、失联对账与连续三轮闭环，分别完成G4／G5；目前均未完成。

另有已知保留边界：额外runtime-context与原returnRun验证器的证据交集、其他失败／取消终态尚未完成；普通超长Worksite的默认标题限制仍在。本轮接受不覆盖这些项，也不将它们自动升级为已批准的新功能卡。

旧RUN-011的一次真实Flash调用是历史证据，许可已消费；本轮无新模型调用、真实Session／生产数据读取或在用安装。文档推送不扩大这些权限。

## 证据入口

仓库入口：[STATE](../../STATE.md)、[QUEUE](../../QUEUE.md)、[046源门索引](../../evidence/RUN-046-INDEX.json)、[044索引](../../evidence/COMPAT-044-INDEX.json)。

本地执行／发布回执留在ignored证据区，不随进度页入库：`evidence/local/20261027-root-candidate-046/controller/receipt.json`、`evidence/local/20261027-run-reconciliation/checker/execution-final-review.json`与`publication-readback.json`；045后续PR12事实见`evidence/local/20261027-root-candidate-045/controller/PUBLICATION.md`。本次GitHub／远端读回由根记录，未修改旧回执。
