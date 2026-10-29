# Run B1 r3 回执

2026-10-30；仅合成候选库、loopback、已有环境。分支 `feat/knot-xwin-write`，起点 `6a8ffb1`。范围为 S4/S5/S6b；未做 S2/S3、真实模型、生产安装或合并，未加依赖。

Maker 自核：全量 **443 passed / 2 skipped**；新增 B1 测试 **14 passed**，覆盖时间轴三条、hash 查询三条、六映射全文一致、候选与原子真值独立、多 token、导出头、pending、审计失败保留、活锁竞态、同标签排序及超过 500 条分页。旧 CLI 测试显式加 --offline；契约样例更新至 23 defs / 13 routes。

独立 Checker：`b1_checker` 只读复核，发现并确认修复活锁竞态、原 intent 审计缺失及排序截断不一致。独立运行 **16 passed in 29.83s**，`git diff --check` 通过；契约三笔 blob 与源逐字节一致，当前无剩余阻断项。此结论不代替全量检查、远端 CI 或人的产品验收。

Gate：依据用户授权完成本分支提交、推送与 PR；不自动合并。远端结果以 PR checks 及最终交付读回为准。工作区原有 REQUEST.md、REQUEST-r2.md、REQUEST-r3.md 未纳入提交。

## 契约三笔与 numstat

numstat 每格为增/删；不存在文件差异记 0/0。

| 版本／commit | schema.json | endpoints.json | CHANGELOG.md |
|---|---:|---:|---:|
| v1.7 `5e821830827b8dad4cbbf12ca8f1e9c4cd1aed3a` | 13/2 | 0/0 | 4/0 |
| v1.8 `2a0e6554badbff6198b1e7691721db1715ca8aad` | 35/0 | 63/0 | 4/0 |
| v1.9 `f134ac9c8888bf7d9a2c9861c2d0038bd4613f32` | 9/3 | 0/0 | 4/0 |

schema SHA256：

```text
v1.7 53d56e244b8b97e4f83243f5cbbed6ed30a97eccc5e4e6cdb20f558cbbf3298d
v1.8 df9b783450d629a92325c41d4afb73f598eeb9ca0a9cb3733d371647e5cf687b
v1.9 e1816ba1ef2fb6f0c26e02940d6af27446e2e618bd68be118ab3fd4a8b4ea9e0
endpoints v1.8/v1.9 63cf834bd79551be250339e66fc42be07feae5c869a7ea821e1973d6ef96a760
```

v1.7 实际 schema 为 13增/2删，源字节未调整。每笔 CHANGELOG 仅追加四行；v1.9 endpoints 没有 diff。

## 实现分笔

- `0f424c8`：CLI 薄传输、服务端只读映射、共享形状投影与离线 guard。
- `0e8024a`：token→actor、完整 pending 审计与离线 reconcile。
- `ad9328b`：新增测试、既有测试适配、selfcheck 两条新增路由。
- 随后文档提交包含本回执、HTTP 用法与原始日志。

`bundle_jobs.py` 只替换 **6 行**，numstat **6增/6删**：第 40 行 submit 增 actor 参数；第 75 行线程 args 透传 actor；第 103 行 _execute 增参数；第 120 行首行追加 `actor={actor}`；第 131 行 _run 增参数；第 143 行调用 _execute 透传。job 状态机、持久结构、失败分支没有修改。

## 检查记录

命令使用任务指定解释器运行：

```text
python -m pytest mvp/tests/ -q
443 passed, 2 skipped in 137.07s (0:02:17)

python -m pytest mvp/tests/test_xwin_write.py -q -s
14 passed in 22.45s

python -m mvp.contract.selfcheck --db <带 objects 的合成库>
selfcheck: 19 PASS / 0 FAIL; exit=0

python -m mvp.contract.selfcheck --db <不存在路径>
selfcheck: 19 PASS / 0 FAIL; exit=0
```

两种 selfcheck 都逐项调用 13 routes＋6 次命令；带 objects 分支创建真实外置 ZIP 供复制及提取，输入 DB 与对象前后字节一致；不存在路径及其父目录未被创建。

原始文件：[全量尾部](evidence/xwin-b1/pytest-full.txt)、[19 项 selfcheck 两次](evidence/xwin-b1/selfcheck.txt)、[B1 原始输出](evidence/xwin-b1/b1-raw.txt)。下面按段转录实测 JSON；六映射的断言比较整个 stdout 字符串，未只比较重排后的 JSON。

### PARITY events

```json
{
  "command": "events",
  "http": [
    {
      "event_id": "f38e40a6-3b10-4d55-ab6a-ef77c80bdc2e",
      "event_time": 0,
      "event_type": "import",
      "recorded_at": 1793293460411
    },
    {
      "event_id": "b8a9f4b0-53c7-4851-a1da-9954f72ac24b",
      "event_time": 0,
      "event_type": "import",
      "recorded_at": 1793293460456
    },
    {
      "event_id": "5e9961b5-84a2-42eb-ad5d-e58f473bb202",
      "event_time": 1793293460489,
      "event_type": "user_confirm",
      "recorded_at": 1793293460489
    }
  ],
  "offline": [
    {
      "event_id": "f38e40a6-3b10-4d55-ab6a-ef77c80bdc2e",
      "event_time": 0,
      "event_type": "import",
      "recorded_at": 1793293460411
    },
    {
      "event_id": "b8a9f4b0-53c7-4851-a1da-9954f72ac24b",
      "event_time": 0,
      "event_type": "import",
      "recorded_at": 1793293460456
    },
    {
      "event_id": "5e9961b5-84a2-42eb-ad5d-e58f473bb202",
      "event_time": 1793293460489,
      "event_type": "user_confirm",
      "recorded_at": 1793293460489
    }
  ]
}
```

### PARITY asset

```json
{
  "command": "asset",
  "http": {
    "asset_id": "97f72871-23f1-438a-abe4-08526826adcb",
    "content_hash": "6526c090762e849c830fd063f3b1d28b5b736aa005198fac053811d4b6714290",
    "media_type": "text/markdown",
    "path": null
  },
  "offline": {
    "asset_id": "97f72871-23f1-438a-abe4-08526826adcb",
    "content_hash": "6526c090762e849c830fd063f3b1d28b5b736aa005198fac053811d4b6714290",
    "media_type": "text/markdown",
    "path": null
  }
}
```

### PARITY claims

```json
{
  "command": "claims",
  "http": [
    {
      "atom": "conditional_theorem",
      "atom_level": {
        "boolean": true,
        "minimal_roots": [
          [
            "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
          ]
        ]
      },
      "candidate_level": {
        "boolean": true,
        "minimal_roots": [
          [
            "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
          ]
        ],
        "status": "confirmed"
      },
      "claim_id": "ff55dc11-fd46-5894-b52f-9cb05b3d26d0",
      "claim_type": "relation",
      "proposed_at": 1793293460426,
      "reviewed_at": 1793293460489,
      "source_label": "T17-01",
      "source_members": [],
      "support_sources": [
        "f38e40a6-3b10-4d55-ab6a-ef77c80bdc2e"
      ],
      "unverified": false,
      "user_response": "accept"
    },
    {
      "atom": "conditional_theorem",
      "atom_level": {
        "boolean": true,
        "minimal_roots": [
          [
            "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
          ]
        ]
      },
      "candidate_level": {
        "boolean": false,
        "minimal_roots": [],
        "status": "unconfirmed"
      },
      "claim_id": "ab29efd3-0a5a-5de2-9bde-bcb907b4dba4",
      "claim_type": "relation",
      "proposed_at": 1793293460468,
      "reviewed_at": null,
      "source_label": "T17-02",
      "source_members": [],
      "support_sources": [
        "b8a9f4b0-53c7-4851-a1da-9954f72ac24b"
      ],
      "unverified": true,
      "user_response": null
    }
  ],
  "offline": [
    {
      "atom": "conditional_theorem",
      "atom_level": {
        "boolean": true,
        "minimal_roots": [
          [
            "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
          ]
        ]
      },
      "candidate_level": {
        "boolean": true,
        "minimal_roots": [
          [
            "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
          ]
        ],
        "status": "confirmed"
      },
      "claim_id": "ff55dc11-fd46-5894-b52f-9cb05b3d26d0",
      "claim_type": "relation",
      "proposed_at": 1793293460426,
      "reviewed_at": 1793293460489,
      "source_label": "T17-01",
      "source_members": [],
      "support_sources": [
        "f38e40a6-3b10-4d55-ab6a-ef77c80bdc2e"
      ],
      "unverified": false,
      "user_response": "accept"
    },
    {
      "atom": "conditional_theorem",
      "atom_level": {
        "boolean": true,
        "minimal_roots": [
          [
            "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
          ]
        ]
      },
      "candidate_level": {
        "boolean": false,
        "minimal_roots": [],
        "status": "unconfirmed"
      },
      "claim_id": "ab29efd3-0a5a-5de2-9bde-bcb907b4dba4",
      "claim_type": "relation",
      "proposed_at": 1793293460468,
      "reviewed_at": null,
      "source_label": "T17-02",
      "source_members": [],
      "support_sources": [
        "b8a9f4b0-53c7-4851-a1da-9954f72ac24b"
      ],
      "unverified": true,
      "user_response": null
    }
  ]
}
```

### PARITY support-claim

```json
{
  "command": "support-claim",
  "http": {
    "at": 1793293460493,
    "atom": "conditional_theorem",
    "atom_view": {
      "boolean": true,
      "minimal_roots": [
        [
          "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
        ]
      ]
    },
    "boolean": true,
    "claim_id": "ff55dc11-fd46-5894-b52f-9cb05b3d26d0",
    "minimal_roots": [
      [
        "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
      ]
    ],
    "source_label": "T17-01",
    "status": "confirmed"
  },
  "offline": {
    "at": 1793293460493,
    "atom": "conditional_theorem",
    "atom_view": {
      "boolean": true,
      "minimal_roots": [
        [
          "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
        ]
      ]
    },
    "boolean": true,
    "claim_id": "ff55dc11-fd46-5894-b52f-9cb05b3d26d0",
    "minimal_roots": [
      [
        "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
      ]
    ],
    "source_label": "T17-01",
    "status": "confirmed"
  }
}
```

### PARITY support-atom

```json
{
  "command": "support-atom",
  "http": {
    "at": 1793293460493,
    "claims": [
      {
        "at": 1793293460493,
        "atom": "conditional_theorem",
        "atom_view": {
          "boolean": true,
          "minimal_roots": [
            [
              "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
            ]
          ]
        },
        "boolean": true,
        "claim_id": "ff55dc11-fd46-5894-b52f-9cb05b3d26d0",
        "minimal_roots": [
          [
            "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
          ]
        ],
        "source_label": "T17-01",
        "status": "confirmed"
      },
      {
        "at": 1793293460493,
        "atom": "conditional_theorem",
        "atom_view": {
          "boolean": true,
          "minimal_roots": [
            [
              "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
            ]
          ]
        },
        "boolean": false,
        "claim_id": "ab29efd3-0a5a-5de2-9bde-bcb907b4dba4",
        "minimal_roots": [],
        "source_label": "T17-02",
        "status": "unconfirmed"
      }
    ],
    "counts": {
      "confirmed": 1,
      "revoked": 0,
      "unconfirmed": 1
    }
  },
  "offline": {
    "at": 1793293460493,
    "claims": [
      {
        "at": 1793293460493,
        "atom": "conditional_theorem",
        "atom_view": {
          "boolean": true,
          "minimal_roots": [
            [
              "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
            ]
          ]
        },
        "boolean": true,
        "claim_id": "ff55dc11-fd46-5894-b52f-9cb05b3d26d0",
        "minimal_roots": [
          [
            "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
          ]
        ],
        "source_label": "T17-01",
        "status": "confirmed"
      },
      {
        "at": 1793293460493,
        "atom": "conditional_theorem",
        "atom_view": {
          "boolean": true,
          "minimal_roots": [
            [
              "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
            ]
          ]
        },
        "boolean": false,
        "claim_id": "ab29efd3-0a5a-5de2-9bde-bcb907b4dba4",
        "minimal_roots": [],
        "source_label": "T17-02",
        "status": "unconfirmed"
      }
    ],
    "counts": {
      "confirmed": 1,
      "revoked": 0,
      "unconfirmed": 1
    }
  }
}
```

### PARITY trace-claim

```json
{
  "command": "trace-claim",
  "http": {
    "assets": [
      {
        "asset_id": "97f72871-23f1-438a-abe4-08526826adcb",
        "content_hash": "6526c090762e849c830fd063f3b1d28b5b736aa005198fac053811d4b6714290",
        "media_type": "text/markdown",
        "path": null
      }
    ],
    "atom": "conditional_theorem",
    "candidate_sources": [
      "f38e40a6-3b10-4d55-ab6a-ef77c80bdc2e"
    ],
    "claim_id": "ff55dc11-fd46-5894-b52f-9cb05b3d26d0",
    "depth": 2,
    "path": [
      {
        "depth": 2,
        "event_id": "f38e40a6-3b10-4d55-ab6a-ef77c80bdc2e",
        "event_time": 0,
        "event_type": "import",
        "evidence_refs": [],
        "recorded_at": 1793293460411,
        "subject": "97f72871-23f1-438a-abe4-08526826adcb"
      },
      {
        "depth": 1,
        "event_id": "5e9961b5-84a2-42eb-ad5d-e58f473bb202",
        "event_time": 1793293460489,
        "event_type": "user_confirm",
        "evidence_refs": [
          "f38e40a6-3b10-4d55-ab6a-ef77c80bdc2e"
        ],
        "recorded_at": 1793293460489,
        "subject": "ff55dc11-fd46-5894-b52f-9cb05b3d26d0"
      }
    ],
    "source_label": "T17-01",
    "status": "confirmed"
  },
  "offline": {
    "assets": [
      {
        "asset_id": "97f72871-23f1-438a-abe4-08526826adcb",
        "content_hash": "6526c090762e849c830fd063f3b1d28b5b736aa005198fac053811d4b6714290",
        "media_type": "text/markdown",
        "path": null
      }
    ],
    "atom": "conditional_theorem",
    "candidate_sources": [
      "f38e40a6-3b10-4d55-ab6a-ef77c80bdc2e"
    ],
    "claim_id": "ff55dc11-fd46-5894-b52f-9cb05b3d26d0",
    "depth": 2,
    "path": [
      {
        "depth": 2,
        "event_id": "f38e40a6-3b10-4d55-ab6a-ef77c80bdc2e",
        "event_time": 0,
        "event_type": "import",
        "evidence_refs": [],
        "recorded_at": 1793293460411,
        "subject": "97f72871-23f1-438a-abe4-08526826adcb"
      },
      {
        "depth": 1,
        "event_id": "5e9961b5-84a2-42eb-ad5d-e58f473bb202",
        "event_time": 1793293460489,
        "event_type": "user_confirm",
        "evidence_refs": [
          "f38e40a6-3b10-4d55-ab6a-ef77c80bdc2e"
        ],
        "recorded_at": 1793293460489,
        "subject": "ff55dc11-fd46-5894-b52f-9cb05b3d26d0"
      }
    ],
    "source_label": "T17-01",
    "status": "confirmed"
  }
}
```

### CANDIDATE

```json
{
  "candidate_level": {
    "boolean": false,
    "minimal_roots": [],
    "status": "unconfirmed"
  },
  "claim_id": "unconditional",
  "claim_support": {
    "at": 1793293460493,
    "atom": "decision",
    "atom_view": {
      "boolean": true,
      "minimal_roots": [
        []
      ]
    },
    "boolean": false,
    "claim_id": "unconditional",
    "minimal_roots": [],
    "source_label": "D-00",
    "status": "unconfirmed"
  }
}
```

### CANDIDATE

```json
{
  "candidate_level": {
    "boolean": true,
    "minimal_roots": [
      [
        "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
      ]
    ],
    "status": "confirmed"
  },
  "claim_id": "ff55dc11-fd46-5894-b52f-9cb05b3d26d0",
  "claim_support": {
    "at": 1793293460493,
    "atom": "conditional_theorem",
    "atom_view": {
      "boolean": true,
      "minimal_roots": [
        [
          "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
        ]
      ]
    },
    "boolean": true,
    "claim_id": "ff55dc11-fd46-5894-b52f-9cb05b3d26d0",
    "minimal_roots": [
      [
        "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
      ]
    ],
    "source_label": "T17-01",
    "status": "confirmed"
  }
}
```

### CANDIDATE

```json
{
  "candidate_level": {
    "boolean": false,
    "minimal_roots": [],
    "status": "unconfirmed"
  },
  "claim_id": "ab29efd3-0a5a-5de2-9bde-bcb907b4dba4",
  "claim_support": {
    "at": 1793293460493,
    "atom": "conditional_theorem",
    "atom_view": {
      "boolean": true,
      "minimal_roots": [
        [
          "5e9961b5-84a2-42eb-ad5d-e58f473bb202"
        ]
      ]
    },
    "boolean": false,
    "claim_id": "ab29efd3-0a5a-5de2-9bde-bcb907b4dba4",
    "minimal_roots": [],
    "source_label": "T17-02",
    "status": "unconfirmed"
  }
}
```

### ACTORS

```json
[
  [
    "ff55dc11-fd46-5894-b52f-9cb05b3d26d0",
    "{\"claim_type\": \"relation\", \"source_label\": \"T17-01\", \"atom\": \"conditional_theorem\", \"decision\": \"accept\", \"actor\": \"hermes\"}"
  ],
  [
    "ab29efd3-0a5a-5de2-9bde-bcb907b4dba4",
    "{\"claim_type\": \"relation\", \"source_label\": \"T17-02\", \"atom\": \"conditional_theorem\", \"decision\": \"accept\", \"actor\": \"codex\"}"
  ]
]
```

### EXPORT

```json
<!-- knot-bundle bundle_id=cbc9417c-debf-44d1-9f08-faa8472b9473 db=bd5e88a2 generated=2026-10-29T17:04:26.466760+00:00 actor=hermes -->
```

### EXPORT

```json
<!-- knot-bundle bundle_id=cbc9417c-debf-44d1-9f08-faa8472b9473 db=bd5e88a2 generated=2026-10-29T17:04:26.497872+00:00 actor=codex -->
```

### PENDING_HEALTH

```json
{
  "contract_version": 1,
  "ok": true,
  "value": {
    "status": "degraded",
    "contract_version": 1,
    "schema_version": "1.4",
    "read_only": true,
    "uptime_s": 0.21799999999348074,
    "seq": 3,
    "db_path_sha256": "bd5e88a238fcaaa6b9ba1bf19ff2b1afb4e7fb1d180c9697a63b9ab32bc6f0ae",
    "pending": {
      "command": "claim.revoke",
      "actor": "hermes",
      "since": 1793293466527
    }
  }
}
```

### RECONCILE_LIST

```json
{
  "pending": {
    "actor": "codex",
    "since": 123,
    "command": "claim.confirm"
  },
  "body_summary": {
    "command": "claim.confirm",
    "sha256": "01987f3eaf07045cd1cb8f872d8a73feed49f1531a0d699d34a64bf6f8afbceb",
    "argument_keys": [
      "claim_id"
    ]
  },
  "cleared": false
}
```

### RECONCILE_LOG

```json
{
  "pending": {
    "body": {
      "command": "claim.confirm",
      "args": {
        "claim_id": "ff55dc11-fd46-5894-b52f-9cb05b3d26d0"
      }
    },
    "actor": "codex",
    "since": 123
  },
  "body_summary": {
    "command": "claim.confirm",
    "sha256": "01987f3eaf07045cd1cb8f872d8a73feed49f1531a0d699d34a64bf6f8afbceb",
    "argument_keys": [
      "claim_id"
    ]
  },
  "reason": "confirmed database checked; discard intent",
  "time": "2026-10-29T17:04:27.853643+00:00",
  "operator": "<operator>"
}
```

### RESTART_AFTER

```json
{
  "contract_version": 1,
  "ok": true,
  "value": {
    "status": "ok",
    "contract_version": 1,
    "schema_version": "1.4",
    "read_only": false,
    "uptime_s": 0.01600000006146729,
    "seq": 0,
    "db_path_sha256": "947afc4cda4f2a92d9a9365732ec07953cd449087c194902e5c7d4918b0d309e",
    "pending": null
  }
}
```
