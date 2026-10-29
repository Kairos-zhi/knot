# Day 16 运行证据与三段自核验

2026-10-29，分支 feat/knot-bundle-day16，起点 ac7d92e。时间先经 Get-Date -Format o 实读；本轮开始为 2026-10-29T22:04:15.9107304+08:00。r2 取代前轮契约阻断，第一笔提交 2a644b0 仅含契约三件。

## 覆盖度

已完成生成器、202/queued、后台 Job、Markdown 导出、持久状态、AC-8b、BUNDLE/HTTP 文档。以下是真实临时库和 HTTP 调用输出；来源是测试显式写入的三个 UTF-8 资产，抽取与确认走现有 Repo / extractor / review，再生成包，未使用真实研究库或模型。不是硬编码返回或生产材料验收。

## 出处

以下原始打印来自 test_selected_content_provenance_and_persistence 与 test_ac8b_raw_lifecycle_export_and_failure。线程屏障仅用于可重复观测 pending/running，生成和 journal 为真实实现。导出测试隔离文件目录，验证 Markdown 与库正文逐字相等及 exported=1。先关闭原实例，再启动新 OS 进程查询同一库与 journal，停止后再次启动验证相等。

```text
CONTEXT_TEXT
# 续接包 86282327-fa66-4df6-8719-69f79135c807

仅含显式选择的资产；候选标签与确认状态来自库，待用户审查。

## 已确认决策

- [D-12] decision（confirmed；claim 60581e54-2f6a-51c2-8e30-b98793f62bc4）
  来源原文：
  > D-12 选择本地事件作为事实来源
  为什么：da601a2d-a243-4fd2-8821-550831d4edd0 → 1efa30b6-115f-48be-a3db-ad8b36b4fd51

## 条件性定理

- [T17-01] conditional_theorem（confirmed；claim ff55dc11-fd46-5894-b52f-9cb05b3d26d0）
  来源原文：
  > T17-01 条件支持需保留来源
  为什么：da601a2d-a243-4fd2-8821-550831d4edd0 → 78d406c0-af82-4915-ba02-9e9159747ef1

## 反例

- [P17-01] counterexample（confirmed；claim 4d8ef28e-2bf4-5c5e-a7db-482eab36e2f6）
  来源原文：
  > P17-01 反例不自动变成决策
  为什么：e7857e7f-f6c5-457c-8ba7-e6443da93e00 → c97ff4e0-d0da-407a-a512-b9fd6db0c7a2

## 未决问题

- [Q18-01] open_question（unconfirmed；claim aef49a54-fcaa-573f-9951-74e874a5521b）
  来源原文：
  > Q18-01 仍需核验导出后的续接
  尚未确认；候选来源事件：e7857e7f-f6c5-457c-8ba7-e6443da93e00

## 来源清单

- asset 0aa7730b (SHA: d88a0182a659)
- asset 6b2ba51c (SHA: d7c916d1aaab)

.AC-8b RAW [[202, {"contract_version": 1, "ok": true, "value": {"command": "bundle.create", "status": "queued", "event_id": null, "job_id": "2e803a34-da53-402e-93e5-92f3f8a17042"}}], [200, {"contract_version": 1, "ok": true, "value": {"job_id": "2e803a34-da53-402e-93e5-92f3f8a17042", "command": "bundle.create", "status": "pending", "created_at": 1793283054865, "updated_at": 1793283054865, "result": null, "error": null}}], [200, {"contract_version": 1, "ok": true, "value": {"job_id": "2e803a34-da53-402e-93e5-92f3f8a17042", "command": "bundle.create", "status": "running", "created_at": 1793283054865, "updated_at": 1793283054879, "result": null, "error": null}}], [200, {"contract_version": 1, "ok": true, "value": {"job_id": "2e803a34-da53-402e-93e5-92f3f8a17042", "command": "bundle.create", "status": "done", "created_at": 1793283054865, "updated_at": 1793283054935, "result": {"bundle_id": "69c3859c-875a-4602-826d-561727de8f71"}, "error": null}}]]
AC-8b EXPORT [[202, {"contract_version": 1, "ok": true, "value": {"command": "bundle.export", "status": "queued", "event_id": null, "job_id": "cbd1a34d-5829-47e7-a807-4c0a56f9b788"}}], [200, {"contract_version": 1, "ok": true, "value": {"job_id": "cbd1a34d-5829-47e7-a807-4c0a56f9b788", "command": "bundle.export", "status": "done", "created_at": 1793283054958, "updated_at": 1793283054993, "result": {"bundle_id": "69c3859c-875a-4602-826d-561727de8f71", "exported": true, "path": "exports/69c3859c-875a-4602-826d-561727de8f71.md"}, "error": null}}]]
AC-8b FAILED [[202, {"contract_version": 1, "ok": true, "value": {"command": "bundle.create", "status": "queued", "event_id": null, "job_id": "8447abb2-fefd-40f5-bc37-26aaec2279b9"}}], [200, {"contract_version": 1, "ok": true, "value": {"job_id": "8447abb2-fefd-40f5-bc37-26aaec2279b9", "command": "bundle.create", "status": "failed", "created_at": 1793283055010, "updated_at": 1793283055028, "result": null, "error": {"code": "BAD_REQUEST", "message": "BAD_REQUEST", "detail": {}}}}]]
AC-8b RESTART [200, {"contract_version": 1, "ok": true, "value": {"job_id": "2e803a34-da53-402e-93e5-92f3f8a17042", "command": "bundle.create", "status": "done", "created_at": 1793283054865, "updated_at": 1793283054935, "result": {"bundle_id": "69c3859c-875a-4602-826d-561727de8f71"}, "error": null}}]
.
2 passed in 3.67s
```

全量测试与 selfcheck 尾部在本页末尾。独立 Checker /root/bundle_checker：代码和文档限定 PASS；独立窄测 12 passed in 6.82s。已修正其提出的来源原文缺失、job journal 故障降级与并发写阻断、编号摘录边界。Checker 不是产品验收者。

## 完整性

指定 v1.5 源逐字节复制；工作区及 Git blob 实读 SHA256 均为：

- schema.json: 28ae01c4cf39bbef4e21755cf949295d8216cb4f99f5c459cd19c5ce5872a6f4
- endpoints.json: a6805f80010072c8ed5784581e78a0861ae49e75a0dfbc6b0bd3254233d1ebe1

claim_review / traceback / claim_support / knot_query 相对起点零 diff。未新增 runtime 依赖，绑定仍仅 127.0.0.1，HTTP 返回与本页未暴露绝对路径。未 reset/amend/force-push，未部署、安装、调用真实模型或合并。

journal 与 SQLite/导出文件不跨介质原子提交；中断作业失败须对账，不保证零副作用。候选快照为 claim_id 作用域视图；外置正文不补写，未宣称全局支持视图或历史续接。限定 Gate 为代码、测试、契约一致性和 PR 交付，人的产品接受仍由之。

## 全量测试尾部

```text
................................ss...................................... [ 70%]
........................................................................ [ 88%]
.................................................                        [100%]
407 passed, 2 skipped in 94.73s (0:01:34)
```

## selfcheck 尾部

```text
PASS POST /commands
PASS GET /jobs/{job_id}
selfcheck: 16 PASS / 0 FAIL; exit=0
```
