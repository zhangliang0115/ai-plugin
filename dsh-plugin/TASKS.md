# dsh-plugin 功能配置化任务清单

> 目标：把 `ai-plugin-toolkit-dsh` 从「MCP 管理 + 优化提示词两套硬编码功能」升级为**功能可开关、行为可配置、模板可自定义**的插件。
>
> **状态：全部完成 ✅**（实现 + 验证证据见 §2 §4；过程决策见 §1）

## 0. 现状（已核实，代码事实）

| 项 | 现状 | 位置 |
|---|---|---|
| 插件配置 | 无。`cordis.patch.yml` 注释写明「plugin takes no config」 | `cordis.patch.yml` |
| 功能入口 | ① Hub Console 设置页签（MCP 管理：Servers / Tool catalog / Search playground）② 优化提示词 dock 按钮 + hero 兜底按钮 ③ `/prompt-optimize` 斜杠命令 | `lib/client.js`、`index.js` |
| 优化规则 | system prompt 硬编码「你是提示词优化助手…按 目标/背景/要求/产出格式 分节。只输出改写后的提示词」 | `lib/hub-bridge.js` |
| 模型 | 硬编码 `model: 'deepseek-chat'`、`temperature: 0.7`、60s 超时，不可配 | `lib/hub-bridge.js` |
| 优化范围 | 仅输入框草稿（`body.text`），不带会话上下文 | `lib/hub-bridge.js`、`index.js` |
| 按钮展示 | `"✦ 优化提示词"`（图标+文字），busy 变 `"✦ …"`，文字不可隐藏 | `lib/client.js` |
| 模板 | 两处硬编码且不一致：桥接 `optimize()` 与 `/prompt-optimize` 命令 | `hub-bridge.js`、`index.js` |

## 1. 已定决策（实现时按此执行，不再变更）

| # | 决策 |
|---|---|
| D1 | 插件配置存 `~/.config/aipx/ai-plugin-toolkit.json`（与 `mcp-hub.json` 同目录，支持 AIPX_CONFIG_DIR / XDG_CONFIG_HOME）；新增路由 GET/POST `/aipx-hub/plugin-config`；客户端只走同源 bridge。写盘复用 tmp+rename 原子写。 |
| D2 | 功能开关默认全开；配置缺失/损坏回退默认值，绝不白屏。 |
| D3 | 模型默认 `deepseek-chat`，可配置（预设 + 自定义）；key 解析保持现状（env → `~/.dsh/.credentials.yaml`）。 |
| D4 | 优化范围默认「仅输入框」；「结合会话」（contextMode=session）已实现：客户端传 sessionId，宿主端经 `ctx.sessionQuery.readSurface` + `@deepseek-ai/dsh-session/surface` 的 `deriveEventMessage` 取最近轮次，取不到/失败自动退回仅输入框（响应带 `contextUsed` 标志）。 |
| D5 | 文字说明默认隐藏（按钮仅 `✦` 图标），`showLabel=true` 显示文字。 |
| D6 | 模板管理：`templates` 列表（id/name/content/active），至多一个 active；生效规则 = active 模板 > `systemPrompt` > 内置默认；内容含 `{{input}}` 时代入用户输入原文，否则作为 user 消息追加；`/prompt-optimize` 与桥接 `optimize()` 归一为同一份配置。 |

### 配置 Schema（实现定稿）

```jsonc
// ~/.config/aipx/ai-plugin-toolkit.json
{
  "features": {
    "mcpConsole":     { "enabled": true },
    "promptOptimize": { "enabled": true }
  },
  "promptOptimize": {
    "showLabel": false,          // false = 按钮仅图标
    "model": "deepseek-chat",    // deepseek-chat | deepseek-reasoner | 任意模型名
    "contextMode": "input",      // "input" | "session"
    "systemPrompt": "…默认文案…",
    "templates": [               // 至多一个 active；active.content 生效
      { "id": "tpl-…", "name": "…", "content": "…(可含 {{input}})", "active": false }
    ]
  }
}
```

## 2. 里程碑与任务（全部完成 ✅）

### M0 配置骨架（A 组）

- [x] **A1** 宿主端 `pluginConfigPathFor()` + `getPluginConfig()/setPluginConfig()`（深合并 PATCH、类型归一、tmp/rename 原子写）。
- [x] **A2** 路由 `GET/POST /aipx-hub/plugin-config`（webserver 按 path 独占注册，同路径合并为单条 `method: 'ANY'` 注册，handler 内按方法分派；无关方法 405）。
- [x] **A3** 客户端模块级配置 store（缓存 + notify/subscribe + `usePluginConfig` hook），dock/hero/HubConsole 三处共用；加载失败复位以便重试。
- [x] **A4** Hub Console 顶部「插件设置」面板（不另开页签）：功能开关×2 + 优化提示词子项，即时保存即时生效。
- [x] **A5** 开关生效：`mcpConsole.enabled=false` 隐藏 Servers/Engine/Tools/Search 四区块（面板保留）；`promptOptimize.enabled=false` 时 dock 返回 null、hero 按钮隐藏、`/aipx-hub/optimize` 直接 403。

### M1 优化规则 / 模型 / 范围可配置（C 组）

- [x] **C1** `HubBridge.optimize()` 硬编码移除：model/有效 system prompt 均读配置（`buildOptimizeMessages` 纯函数抽出，便于测试）。
- [x] **C2** 设置面板模型选择：预设下拉（chat/reasoner/自定义）+ 自定义文本输入。
- [x] **C3** `contextMode` 选择器（仅输入框 / 结合会话）+ 文档说明；「仅输入框」行为与现状一致。

### M2 自定义提示词模板管理（D 组）

- [x] **D1** 后端模板 CRUD：PATCH 语义（整个 templates 列表替换），归一化强制至多一个 active，删除 active 后自动回退 systemPrompt/默认。
- [x] **D2** 客户端模板管理 UI：列表（生效中标记、预览、设为生效/编辑/删除）+ 新建/编辑表单。
- [x] **D3** `/prompt-optimize` 斜杠命令归一：读同一份配置（active 模板 > systemPrompt > 内置默认），读不到时回退默认文案；`{{input}}` 代入。

### M3 结合会话上下文（E 组）

- [x] **E1** 客户端 dock 经 slot session-scope 的 inject 拿到 `sessionId` 并随请求发送；宿主端 `loadSessionContext` 惰性解析 `ctx.sessionQuery` → `readSurface` → `deriveEventMessage` → 最近 6 轮（每条截 2000 字符）；任何失败（服务缺失/会话不存在/导入失败）→ 返回 null → 自动回退 input 模式，响应带 `contextUsed`。

### M4 UI 精简与生成中效果（B 组）

- [x] **B1** dock 与 hero 两处由 `showLabel` 控制：默认仅 `✦` 图标（title/aria-label 保留完整说明），`showLabel=true` 显示「✦ 优化提示词」。
- [x] **B2** busy 态：dock 显示 spinner + 「生成中…」；hero 显示「✦ 生成中…」→ 成功「✦ 已替换」→ 恢复；`prefers-reduced-motion` 时 spinner 静止。

### M5 边界与回归（F 组）

- [x] **F1** 错误路径：空输入 / 找不到输入框 / bridge 不可用 / key 缺失 / API 4xx·5xx / 功能关闭 403，三处表现一致（403 已有 e2e 断言）。
- [x] **F2** 回归：既有 MCP 管理三区块、`/aipx-hub/*` 既有路由、bridge 故障降级不变。顺带修复：apply() 里重复的第二次 `startHubBridge(ctx)`（会重复注册路由并打印 warning）已删除。

## 3. 改动文件地图

| 动 | 文件 |
|---|---|
| 配置读写、路由（含 ANY 客制）、model/规则/模板、会话上下文、斜杠命令归一、重复 startHubBridge 清理 | `index.js`、`lib/hub-bridge.js` |
| 配置 store、插件设置面板、开关生效、图标化、生成中效果、sessionId 注入 | `lib/client.js` |
| 说明文档 | 仓库根 `README.zh-CN.md`（新增「插件设置」段落） |

## 4. 验证记录

**Node 级（lib/hub-bridge.js）**
- 默认值归一、`buildOptimizeMessages`（history 截 6 轮/2000 字、`{{input}}` 代入、无 history 时不追加 user 消息）、`messageText` 部件展开、PATCH 深合并（改 model/contextMode 不清 systemPrompt）、坏文件回退默认——全部断言通过。
- E2E（stub fetch）：功能关闭 → 403；session 模式 → messages = [system, 历史×2, user 草稿]、model 从配置读、`contextUsed=true`；input 模式 → 无历史、`contextUsed=false`——11 项断言全部通过。

**客户端（React SSR smoke）**
- 模块求值 + apply() 注册：dock 的 inject 正确转发 sessionId；
- dock 默认渲染仅 `✦`（无「优化提示词」文案）、aria-label 保留；
- 插件设置面板全量渲染（开关、模型、范围、规则、模板区）；
- HubConsole 初始渲染。

**真实集成（一次性测试 profile，DSH_HOME=/tmp，AIPX_CONFIG_DIR=/tmp，端口 3899）**
- `dsh --dump-config` 确认插件入树；GET /aipx-hub/plugin-config 返回默认；
- POST 开关+模型+范围 → 持久化到临时目录 JSON、再读一致、无关字段未重置；
- 功能关闭时 POST /aipx-hub/optimize → 403；
- contextMode=session + 不存在的 sessionId → `contextUsed:false`、优化正常运行（真实 DeepSeek API 一次调用，仅测试用）。

## 5. 已知边界（诚实记录）

- 「结合会话」的会话历史来自 `ctx.sessionQuery`（由 `dsh-session-query-sqlite` 等 provider 提供）；provider 缺失的 profile 上该模式自动退回「仅输入框」，不报错。
- hero 首页无会话 id，`session` 模式在 hero 上天然退回 input。
- web GUI 的全量人工走查未做（本环境无法从零起完整 web 交互）；上述 SSR + 真实集成已覆盖主要路径。
