<div align="center">

# ai-plugin

**一条命令，把任意 AI Agent 技能/插件装进所有 Agent。**

Claude Code · DeepSeek Harness (dsh) · Codex CLI · Gemini CLI · GitHub Copilot · Cursor · OpenClaw

[![CI](https://github.com/zhangliang0115/ai-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/zhangliang0115/ai-plugin/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/node/v/aipx.svg)](package.json)
[![GitHub stars](https://img.shields.io/github/stars/zhangliang0115/ai-plugin?style=social)](https://github.com/zhangliang0115/ai-plugin/stargazers)

[English](README.md) | 简体中文

</div>

---

你的电脑上装了 4 个不同的 AI Agent，你发现一个很棒的技能仓库。然后呢？把文件夹复制进
`~/.claude/skills`，再复制进 `~/.agents/skills`、`~/.gemini/skills`、
`~/.copilot/skills`……上游一更新还得重新来一遍。

**`aipx` 就是为解决这个问题而生的。** 一条命令，下载一次，装进机器上检测到的所有
Agent。一条 `sync`，把技能库链接到所有 Agent。内置的技能还会教你（和你的 Agent）
如何用一个仓库面向所有 harness 发布插件。

```bash
npx github:zhangliang0115/ai-plugin install <owner>/<repo>
```

## 为什么需要

所有 Agent harness 都收敛到了同一个技能格式——`SKILL.md`——但**安装路径**各不相同：

| Agent | 从哪里读技能 |
|---|---|
| DeepSeek Harness (`dsh`) | `~/.agents/skills/` + `<project>/.agents/skills/` |
| Codex CLI | `~/.agents/skills/` + `<project>/.agents/skills/` |
| Claude Code | `~/.claude/skills/` + `<project>/.claude/skills/` |
| Gemini CLI | `~/.gemini/skills/` + `<project>/.gemini/skills/` |
| GitHub Copilot CLI | `~/.copilot/skills/` + `<project>/.github/skills/` |
| Cursor / OpenCode / OpenClaw | 各自的根目录（[完整矩阵](docs/compatibility-matrix.md)） |

插件体系更加碎片化：Claude Code 要 `/plugin marketplace add`，dsh 要
`dsh plugin --profile web add "github:o/r#path:/dsh-plugin"`，Gemini 要
`gemini extensions`。`aipx` 就是缺失的那个公约数：一个安装器、一次同步、一份清单，
通吃所有 Agent。

## 命令

```bash
aipx install owner/repo                          # 自动识别仓库根目录或 skills/
aipx install owner/repo#path:/skills/their-skill # 子目录（与 dsh 相同的语法）
aipx install https://github.com/owner/repo/tree/v1.2/skills/x   # 锁定 ref
aipx install ./my-skill                          # 本地目录

aipx sync            # 把 ~/.agents/skills 链接到其他所有检测到的 Agent 根目录
aipx list            # 按 Agent 列出已装技能
aipx search deepseek # 精选注册表；加 --github 实时搜索 GitHub topics
aipx remove <name>   # 从所有 Agent 卸载
aipx doctor          # 环境与 Agent 检测报告
```

示例：

```console
$ aipx install JimmyLv/bibigpt-skill#path:/skills/bibi
✔ detected skill with 1 skill(s):
    bibi — Summarize YouTube, Bilibili videos and podcasts…
✔ target roots:
    /Users/you/.agents/skills   (DeepSeek Harness (dsh))
    /Users/you/.claude/skills   (Claude Code)
✔ installed bibi into 2 root(s)
```

## 内置工具包（本仓库本身就是一个插件包）

三种用法：

```bash
# 1. 纯技能，所有 Agent：
aipx install zhangliang0115/ai-plugin

# 2. Claude Code 市场：
#    /plugin marketplace add zhangliang0115/ai-plugin
#    /plugin install ai-plugin-toolkit@ai-plugin

# 3. DeepSeek Harness bundle：
dsh plugin --profile web add "github:zhangliang0115/ai-plugin#path:/dsh-plugin"
```

| 技能 | 教会你的 Agent |
|---|---|
| `skill-author` | 编写能在所有 harness 加载的 SKILL.md 技能 |
| `dsh-plugin-dev` | 打包发布 DeepSeek Harness bundle（cordis.patch.yml、ctx.skills.register、git 安装的坑） |
| `claude-plugin-dev` | 发布 Claude Code 插件与市场 |
| `deepseek-cost-router` | 在 deepseek-chat / deepseek-reasoner 之间路由任务，降低 API 成本 |

## 设计原则

- **零依赖。** 一个关注点一个 JS 文件，`node:test` 测试套件，无供应链风险。
- **非破坏性。** 已存在的目标默认跳过（`--force` 覆盖）；`--dry-run` 预览；
  卸载走清单。
- **诚实的分级。** 官方文档确认的路径默认写入；社区报告的路径（Cursor、
  OpenCode、OpenClaw）需要 `--all` 或 `--agents` 显式指定。
- **标准优先。** 全面采用 SKILL.md；优先符号链接而非复制；以 `~/.agents/skills`
  为同步主根（dsh 与 Codex 本来就共享它）。

## 文档

- [兼容性矩阵](docs/compatibility-matrix.md) — 每个根目录、每个分级
- [安装到 DeepSeek Harness (dsh)](docs/install-into-dsh.md) — 调研指南：技能根、分层、bundle 格式、常见的坑
- [安装到 Claude Code](docs/install-into-claude-code.md) — 市场与插件
- [一次发布，全端生效](docs/publish-dual-target.md) — 双目标仓库布局

## 环境要求

Node.js ≥ 20 与 `tar`（macOS、Linux、Windows 10+ 均内置）。无需 `npm install`——
`npx github:zhangliang0115/ai-plugin` 直接从仓库运行。可选：`GITHUB_TOKEN`
提升 API 速率限制。

## 路线图

- [x] v0.1 — install / sync / list / search / remove / doctor
- [ ] v0.2 — 项目级安装（`--project`）、`aipx new` 技能脚手架、`aipx upgrade` 更新流
- [ ] v0.3 — MCP server 配置跨 Agent 同步、npm registry 发布
- [ ] v0.4 — 质量评分与技能 lint（`aipx lint`）、注册表网站

详见 [ROADMAP.md](ROADMAP.md) 与 [CHANGELOG.md](CHANGELOG.md)。

## 参与贡献

欢迎 PR——尤其是新增精选注册表条目和确认社区级根路径。参见
[CONTRIBUTING.md](CONTRIBUTING.md) 与
[插件提交模板](.github/ISSUE_TEMPLATE/plugin-submission.md)。

## 许可证

[MIT](LICENSE) © 2026 zhangliang0115
