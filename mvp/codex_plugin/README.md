# Knot local Codex plugin candidate

Prepare a private Python environment and set `$knotPython` to its absolute interpreter path. From the repository root in PowerShell, install the declared dependencies into that environment, then build with `$knotOrigin` set to the chosen loopback HTTP origin and explicit port:

```powershell
& $knotPython -m pip install -r mvp/requirements-plugin.txt
& $knotPython -B mvp/codex_plugin/build.py --python $knotPython --origin $knotOrigin --output ./knot-candidate
```

The output includes the same dependency declaration as `requirements.txt` for manual installation into a private Python environment. The builder and launcher perform no dependency installation.

Choose a new output directory with an existing parent. The output contains the Codex compatibility manifest, generated stdio configuration and reviewed server and projection sources. You can move the output directory while the interpreter and configured service stay available at their original addresses. Rebuild to change either address. The Python environment remains external to this development candidate. If the executable disappears, the host reports a process spawn error. Missing or incompatible SDK dependencies produce `KNOT_DEPENDENCY_REQUIRED` on stderr.

Provide `KNOT_TOKEN` in the Codex process environment before launching the host. The generated MCP config allowlists only the variable name, and the launcher returns `KNOT_TOKEN_REQUIRED` on stderr if the variable is absent or blank. The compatibility layout uses `.codex-plugin/plugin.json` and `.mcp.json` because its MCP parser supports the variable-name allowlist. Its relative cwd resolves to the installed plugin root. [Codex compatibility MCP parser](https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/plugin_config.rs), [portable MCP parser](https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/agent_plugin_config.rs)

The Windows Codex CLI `0.166.0-alpha.5.1` app-server probe used a temporary Codex home and test marketplace. Codex discovered and installed the candidate into that temporary home, then invoked the tool from an ephemeral session. The synthetic HTTP service received one authenticated GET. This verifies the app-server path with the token supplied to the test process. Interactive Desktop use and production configuration remain separate gates.
