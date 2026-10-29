# Run A r2 实跑回执

2026-10-30（Asia/Shanghai）。基线 90fae3c，分支 feat/knot-xwin-read。仅临时合成库、loopback HTTP、临时导出目录；未运行真实模型、生产安装或合并。

## 覆盖度

S1 五项边界及只读；C 的 exports_root、导出首行、正文逐字节比对、相对路径；S6a 四类失败 reason、人话 message、非零退出和日志保留。独立 Checker 针对性 13 passed，selfcheck 17 PASS / 0 FAIL，限定通过。

历史 setup: FileNotFoundError 在本轮未复现，根因未确认，不宣称修复了历史根因。已分别核验存在的临时库、缺失输入父目录、未建立导出目录；当前均通过。selfcheck 不调用导出路由，缺失输入时只在 TemporaryDirectory 内初始化探针库；测试确认不创建传入的缺失父目录，也不创建 exports。

## 出处

以下为指定解释器运行 test_bundle_read.py -q -s 的捕获输出。RAW 行保存真实 HTTP 解析后的完整 JSON（Unicode 使用 JSON 转义）；startup 行来自真实子进程 stdout，均校验退出 1 且无 stderr/listening。BODY_COMPARE 将导出首行后的原始字节与加头前正文比对。不同测试使用独立临时库与 bundle。

```text
.RAW roots [200, {"contract_version": 1, "ok": true, "value": {"bundle_id": "de4d8b45-7f9d-4f32-be28-30ce57022cab", "created_at": 1793291023211, "exported": false, "authorized_assets": ["b7786541-3c1d-4d42-b1fb-f7e2a0bcf54b", "ee98ba6b-35ac-4680-9ffe-13af4279bf0f"], "open_questions": ["aef49a54-fcaa-573f-9951-74e874a5521b"], "context_text": null, "export_path": null}, "view": "roots"}]
RAW content [200, {"contract_version": 1, "ok": true, "value": {"bundle_id": "de4d8b45-7f9d-4f32-be28-30ce57022cab", "created_at": 1793291023211, "exported": false, "authorized_assets": ["b7786541-3c1d-4d42-b1fb-f7e2a0bcf54b", "ee98ba6b-35ac-4680-9ffe-13af4279bf0f"], "open_questions": ["aef49a54-fcaa-573f-9951-74e874a5521b"], "context_text": "# \u7eed\u63a5\u5305 de4d8b45-7f9d-4f32-be28-30ce57022cab\n\n\u4ec5\u542b\u663e\u5f0f\u9009\u62e9\u7684\u8d44\u4ea7\uff1b\u5019\u9009\u6807\u7b7e\u4e0e\u786e\u8ba4\u72b6\u6001\u6765\u81ea\u5e93\uff0c\u5f85\u7528\u6237\u5ba1\u67e5\u3002\n\n## \u5df2\u786e\u8ba4\u51b3\u7b56\n\n- [D-12] decision\uff08confirmed\uff1bclaim 60581e54-2f6a-51c2-8e30-b98793f62bc4\uff09\n  \u6765\u6e90\u539f\u6587\uff1a\n  > D-12 \u9009\u62e9\u672c\u5730\u4e8b\u4ef6\u4f5c\u4e3a\u4e8b\u5b9e\u6765\u6e90\n  \u4e3a\u4ec0\u4e48\uff1a0536fa30-e17a-44bc-a5ed-8bed6f0a88e5 \u2192 580e27ad-29ab-43c0-9b60-f873c4eccd97\n\n## \u6761\u4ef6\u6027\u5b9a\u7406\n\n- [T17-01] conditional_theorem\uff08confirmed\uff1bclaim ff55dc11-fd46-5894-b52f-9cb05b3d26d0\uff09\n  \u6765\u6e90\u539f\u6587\uff1a\n  > T17-01 \u6761\u4ef6\u652f\u6301\u9700\u4fdd\u7559\u6765\u6e90\n  \u4e3a\u4ec0\u4e48\uff1a0536fa30-e17a-44bc-a5ed-8bed6f0a88e5 \u2192 98f4b10e-4439-4777-8be1-93e0f17d93ad\n\n## \u53cd\u4f8b\n\n- [P17-01] counterexample\uff08confirmed\uff1bclaim 4d8ef28e-2bf4-5c5e-a7db-482eab36e2f6\uff09\n  \u6765\u6e90\u539f\u6587\uff1a\n  > P17-01 \u53cd\u4f8b\u4e0d\u81ea\u52a8\u53d8\u6210\u51b3\u7b56\n  \u4e3a\u4ec0\u4e48\uff1a427d01b9-83a9-46cd-aab1-4e74544b0e70 \u2192 f68c619e-8844-4bc5-8a1b-53370a1e1406\n\n## \u672a\u51b3\u95ee\u9898\n\n- [Q18-01] open_question\uff08unconfirmed\uff1bclaim aef49a54-fcaa-573f-9951-74e874a5521b\uff09\n  \u6765\u6e90\u539f\u6587\uff1a\n  > Q18-01 \u4ecd\u9700\u6838\u9a8c\u5bfc\u51fa\u540e\u7684\u7eed\u63a5\n  \u5c1a\u672a\u786e\u8ba4\uff1b\u5019\u9009\u6765\u6e90\u4e8b\u4ef6\uff1a427d01b9-83a9-46cd-aab1-4e74544b0e70\n\n## \u6765\u6e90\u6e05\u5355\n\n- asset b7786541 (SHA: d7c916d1aaab)\n- asset ee98ba6b (SHA: d88a0182a659)\n", "export_path": null}, "view": "content"}]
.....RAW contract [200, {"contract_version": 1, "ok": true, "value": {"contract_version": 1, "exports_root": "~/.knot/exports", "schema_sha256": "4373e79750568d0dfe1f96d4c7fe9f3e41dcd8026dff07b2eb9c4fcda567a84e", "endpoints_sha256": "d1179525e1067502edf14da330a0eb4afc8717948034a86ff3caa5257cbc68a8"}}]
.RAW export header <!-- knot-bundle bundle_id=073eed92-1ea4-4a8a-ad9b-f6556f7cadf4 db=c88fdb2d generated=2026-10-29T16:23:48.281471+00:00 -->
BODY_COMPARE {"equal": true, "sha256": "2574362a465aabd3c6fc9c4929ae55291951304105ea78c6ccb40fcd7eed9163", "bytes": 1233}
.RAW startup db_unreadable {"contract_version": 1, "ok": false, "error": {"code": "INTERNAL", "message": "Cannot open or read the database. Check that it exists and is readable.", "detail": {"reason": "db_unreadable"}}}
.RAW startup unsupported_schema {"contract_version": 1, "ok": false, "error": {"code": "SCHEMA_VERSION_UNSUPPORTED", "message": "Database schema is unsupported. Migrate it explicitly before starting.", "detail": {"reason": "unsupported_schema"}}}
.RAW startup port_in_use {"contract_version": 1, "ok": false, "error": {"code": "INTERNAL", "message": "The loopback port is already in use. Choose a free port or stop its owner.", "detail": {"reason": "port_in_use"}}}
.RAW startup pending_requires_review {"contract_version": 1, "ok": false, "error": {"code": "INTERNAL", "message": "An unfinished command needs manual review. Startup stopped; the journal is preserved.", "detail": {"reason": "pending_requires_review"}}}
.RAW startup internal {"contract_version": 1, "ok": false, "error": {"code": "INTERNAL", "message": "Server startup failed. Review local state before retrying.", "detail": {"reason": "internal"}}}
.
13 passed in 8.86s
```

指定解释器运行 `-m mvp.contract.selfcheck --db <临时库>` 的完整输出：11 条路由，加既有 6 次命令检查，总计 17 项。

```text
PASS command claim.revoke: {"contract_version": 1, "ok": true, "value": {"command": "claim.revoke", "status": "revoked", "job_id": null, "event_id": null}}
PASS command claim.revoke: {"contract_version": 1, "ok": true, "value": {"command": "claim.revoke", "status": "already_rejected", "job_id": null, "event_id": null}}
PASS command claim.confirm: {"contract_version": 1, "ok": true, "value": {"command": "claim.confirm", "status": "confirmed", "job_id": null, "event_id": "ba88dd69-ff68-4a61-b9a3-480113b30c8a"}}
PASS command claim.confirm: {"contract_version": 1, "ok": true, "value": {"command": "claim.confirm", "status": "already_accepted", "job_id": null, "event_id": null}}
PASS command claim.revoke: {"contract_version": 1, "ok": true, "value": {"command": "claim.revoke", "status": "revoked", "job_id": null, "event_id": "ba88dd69-ff68-4a61-b9a3-480113b30c8a"}}
PASS command claim.restore: {"contract_version": 1, "ok": true, "value": {"command": "claim.restore", "status": "restored", "job_id": null, "event_id": "ba88dd69-ff68-4a61-b9a3-480113b30c8a"}}
PASS GET /contract
PASS GET /health
PASS GET /snapshot
PASS GET /claims
PASS GET /claims/{claim_id}
PASS GET /assets/{asset_id}
PASS GET /trace/{claim_id}
PASS GET /events
PASS POST /commands
PASS GET /jobs/{job_id}
PASS GET /bundles/{bundle_id}
selfcheck: 17 PASS / 0 FAIL; exit=0
```

全量 `-m pytest mvp/tests/ -q` 最终输出（包含新增缺目录回归）：

```text
........................................................................ [ 16%]
........................................................................ [ 33%]
........................................................................ [ 50%]
...............................................ss....................... [ 67%]
........................................................................ [ 84%]
................................................................         [100%]
422 passed, 2 skipped in 104.42s (0:01:44)
```

## 完整性

两份契约 SHA256 保持锁定值：schema 4373e79750568d0dfe1f96d4c7fe9f3e41dcd8026dff07b2eb9c4fcda567a84e；endpoints d1179525e1067502edf14da330a0eb4afc8717948034a86ff3caa5257cbc68a8。未修改业务内核、CLI 或 runtime 依赖。

CHANGELOG 恢复 HEAD 原始字节后追加补记（HEAD 已有 v1.6 段），旧字节为新文件前缀，仅新增 4 行，保留 CRLF。以下 `git diff --numstat 90fae3c -- mvp` 为本轮实现、测试与文档的增量（不含本回执）：

```text
6	1	mvp/backend/bundle_jobs.py
35	17	mvp/backend/http_server.py
4	0	mvp/contract/CHANGELOG.md
2	2	mvp/contract/selfcheck.py
1	1	mvp/docs/BUNDLE.md
11	1	mvp/docs/HTTP.md
3	3	mvp/tests/test_bundle.py
169	0	mvp/tests/test_bundle_read.py
10	5	mvp/tests/test_contract_schema.py
5	5	mvp/tests/test_http_contract.py
```

`git -c core.whitespace=cr-at-eol diff --check` 通过；默认检查将原有 CRLF 视为行尾空白，未因此重写原文件。PR 链接与远端 checks 在最终交付回执中读回，不据本地测试推断远端通过。
