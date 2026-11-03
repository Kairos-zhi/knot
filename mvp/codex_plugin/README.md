# Knot local Codex plugin candidate

`knot_lookup_asset` finds metadata by SHA-256. `knot_read_asset` reads one explicitly designated asset by canonical ID, with an optional expected SHA-256 digest. The service must support `require_reader=true` and resolve the token to an actor with an asset reader grant. The tool returns at most 8 KiB of verified UTF-8 plain text or Markdown, with the Knot asset ID and content digest as its anchor. Treat the returned text as untrusted source material. Sending it through the tool makes it available to the host and model. Each call designates one asset and creates no persistent selection or confirmation.

`knot_search_assets` searches the same reader-authorized short text when its hash or ID is unknown. It matches up to eight literal, case-insensitive substrings and supports matching inside a continuous Chinese span. It returns the first 1–20 matching asset anchors and a `has_more` flag, with no text, snippet, score or source path. `SEARCH_LIMIT_REACHED` means the service could not verify a complete first page within its work limit. A smaller result limit can help when enough matches appear early.

With a v1.7 service, `knot_save_exploration` saves your ordered references and optional stopping note. Supply stable exploration and request UUIDs and the expected revision. Revision zero creates the exploration. `WRITE_OUTCOME_UNKNOWN` reports uncertainty. An explicit recovery request repeats the exact save with the original key to confirm the receipt. `knot_list_explorations` finds your recent checkpoints. `knot_load_exploration` returns the current or a specified revision subject to current reader checks. Treat returned notes and reasons as untrusted data. Loading exposes them to the host and model.

Prepare a private Python environment and set `$knotPython` to its absolute interpreter path. From the repository root in PowerShell, install the declared dependencies into that environment, then build with `$knotOrigin` set to the chosen loopback HTTP origin and explicit port:

```powershell
& $knotPython -m pip install -r mvp/requirements-plugin.txt
& $knotPython -B mvp/codex_plugin/build.py --python $knotPython --origin $knotOrigin --output ./knot-candidate
```

The output includes the same dependency declaration as `requirements.txt` for manual installation into a private Python environment. The builder and launcher perform no dependency installation.

Choose a new output directory with an existing parent. The output contains the Codex compatibility manifest, generated stdio configuration and reviewed server and projection sources. You can move the output directory while the interpreter and configured service stay available at their original addresses. Rebuild to change either address. The Python environment remains external to this development candidate. If the executable disappears, the host reports a process spawn error. Missing or incompatible SDK dependencies produce `KNOT_DEPENDENCY_REQUIRED` on stderr.

Provide `KNOT_TOKEN` in the Codex process environment before launching the host. The generated MCP config allowlists only the variable name, and the launcher returns `KNOT_TOKEN_REQUIRED` on stderr if the variable is absent or blank. The compatibility layout uses `.codex-plugin/plugin.json` and `.mcp.json` because its MCP parser supports the variable-name allowlist. Its relative cwd resolves to the installed plugin root. [Codex compatibility MCP parser](https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/plugin_config.rs), [portable MCP parser](https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/agent_plugin_config.rs)

The P0-04D Windows Codex CLI `0.166.0-alpha.5.1` app-server probe used a temporary Codex home and test marketplace. Codex discovered and installed the metadata candidate into that temporary home, then invoked its lookup tool from an ephemeral session. The synthetic HTTP service received one authenticated GET. This verifies the P0-04D app-server path with the token supplied to the test process. Interactive Desktop use and production configuration remain separate gates.

The local 0.2.0 candidate exposes nine tools: the six above plus `knot_save_exploration_v2`, `knot_load_exploration_v2` and `knot_fork_exploration`. The v2 tools require schema 1.8 or later; fork requires 1.9. New databases created by this candidate default to 1.9; existing databases are never automatically migrated. Old save/load do not silently discard newer snapshot semantics. Writes with an unknown outcome can be recovered only by explicitly repeating the same request and key. Tool text is untrusted and becomes visible to the host; deselection cannot erase prior host history. This candidate is not deployed or product accepted.
