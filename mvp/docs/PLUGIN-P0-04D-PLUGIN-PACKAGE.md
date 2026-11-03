# P0-04D Codex plugin package

Baseline `df0b9a108016d83e6dbbd59a8b2a50fc9c4c7a7c`. Package the reviewed read-only stdio server and projection from P0-04C. The candidate adds only the manifest, build and launch entry points, instructions, and package regression tests.

The builder writes a fresh output directory using an explicit interpreter and loopback HTTP origin with a port. A movable package directory on the same machine relies on the configured Python environment and MCP SDK 2.1.1. Choose Codex's compatibility layout for its stdio `env_vars` allowlist and plugin-relative `cwd`. The portable parser translates only its declared stdio fields and exposes no variable-name allowlist. The candidate requires `KNOT_TOKEN` in the host process environment and writes only its name to configuration. [Codex compatibility MCP parser](https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/plugin_config.rs), [portable MCP parser](https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/agent_plugin_config.rs)

Maker checks the generated config, a move to a path with spaces and Chinese characters, tool discovery and one authenticated projected GET to a synthetic service, and rejection of missing Python, invalid origin, missing dependencies, missing token, and an existing output directory. The SDK test resolves the plugin-relative cwd and supplies the synthetic token directly. Actual Codex parser and startup checks have separate evidence. User acceptance, production configuration and real data access have separate gates.

The isolated Windows host probe used Codex CLI `0.166.0-alpha.5.1`. Its app-server listed, read and installed the candidate in a temporary marketplace and Codex home, then discovered the MCP tool and called it through an ephemeral session. Codex resolved the cache cwd and forwarded the allowlisted variable. The synthetic HTTP service recorded one authenticated GET. Private evidence is under `host-probe/run-121950-0d65ad/evidence.json`. The current user's Codex configuration stayed untouched. The probe used no model turn or real data.

## Ownership and scope

GPT-6 coordinates the card and Gate, GPT-6.1 is Maker, and `plugin_checker` independently reviews and binds its evidence. The six allowed source paths are:

- `mvp/codex_plugin/build.py`
- `mvp/codex_plugin/launch.py`
- `mvp/codex_plugin/plugin.json`
- `mvp/codex_plugin/README.md`
- `mvp/tests/test_plugin_package.py`
- `mvp/docs/PLUGIN-P0-04D-PLUGIN-PACKAGE.md`

## Verification record

- The compatibility launcher, MCP endpoint and projection passed 40 targeted tests at the compatibility implementation snapshot.
- After adding the existing `mvp/requirements-plugin.txt` to the generated package as `requirements.txt`, all four package tests passed. The relocation test checks that the copied declaration matches the source byte for byte. Dependency installation is a manual step for the external private Python environment.
- The P0-04B/C/D chain is local and unpushed. The host probe used temporary configuration and made no model call.
