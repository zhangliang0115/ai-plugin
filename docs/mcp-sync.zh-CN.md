# 跨 Agent 的 MCP 配置同步

每个支持 MCP 的 Agent 都把服务器列表存在不同位置、不同格式。`aipx mcp` 提供
统一的盘点与一键复制。

## 各 Agent 的 MCP 配置位置

| Agent | 配置文件 | 格式 | 键名 | 分级 |
|---|---|---|---|---|
| Claude Code | `~/.claude.json` | JSON | `mcpServers` | 官方 |
| Gemini CLI | `~/.gemini/settings.json` | JSON | `mcpServers` | 官方 |
| Codex CLI | `~/.codex/config.toml` | TOML | `[mcp_servers.NAME]` | 官方 |
| Cursor | `~/.cursor/mcp.json` | JSON | `mcpServers` | 社区 |
| GitHub Copilot CLI | `~/.copilot/mcp-config.json` | JSON | `mcpServers` | 社区 |
| OpenCode | `~/.config/opencode/opencode.json` | JSON | `mcp` | 社区 |
| DeepSeek Harness (`dsh`) | bundle / patch | — | — | 不适用* |

\* dsh 通过自己的"万物皆插件"配置体系运行 MCP——请用 dsh bundle 或
`cordis.patch.yml` overlay 添加 MCP 服务器（见 [install-into-dsh.md](install-into-dsh.md)）。

## `aipx mcp list`

```console
$ aipx mcp list
Claude Code (~/.claude.json)
    (no servers configured)

Codex CLI (~/.codex/config.toml)
    node_repl /Applications/Codex.app/…/node_repl
```

`--json` 输出机器可读格式；`--all` 包含社区级配置。

## `aipx mcp sync <name>`

把已经配置好的服务器定义复制到其他所有可写的配置：

```sh
aipx mcp sync fetch                     # 从首次找到的配置 → 所有官方级目标
aipx mcp sync fetch --from claude-code  # 显式指定来源
aipx mcp sync fetch --agents gemini,codex
aipx mcp sync fetch --dry-run
```

- **JSON 目标**做合并写入，绝不整文件覆盖：无关键值和其他服务器全部保留，
  文件以两空格缩进重写。
- **Codex TOML** 由最小化 `[mcp_servers.NAME]` 表写入器处理：文件中 `[model]`、
  `[profile]` 等其他部分逐字保留，只有同名服务器表被替换或追加。
- **远程 (url) 服务器**对 Codex 跳过并给出提示——TOML 写入器目前只支持
  stdio 定义（command/args/env）。
- **OpenCode** 的定义形状不同（`command` 为数组），暂时只读——`mcp sync`
  会打印定义供手动添加。
- 社区分级目标（Cursor、Copilot、OpenCode）需要 `--all` 或 `--agents` 才会
  写入，与技能安装的策略一致。

## 诚实策略

与 aipx 其他部分相同：官方文档确认的路径默认写入；社区报告的路径保持
opt-in；不支持的形状会显式跳过并告知，而不是产出坏配置。
