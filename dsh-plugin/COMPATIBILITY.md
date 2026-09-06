# DSH 兼容性 —— 钉住的版本与 API 依赖

本插件(`dsh-plugin/ai-plugin-toolkit-dsh`)是针对特定 DSH 版本开发并测试的。
DSH(deepseek-harness)迭代快,升级前先读这份清单:知道哪些接口钉死了、要核对什么。

> 版本来源:`~/.dsh/profiles/web/node_modules/@deepseek-ai/*/package.json`
> 升级判断:DSH 发新版 → 用文末的核对清单逐项查,不盲升级。

## 版本钉

| 包 | 版本 | 说明 |
|---|---|---|
| `@deepseek-ai/dsh` | `0.1.2-rc.1` | harness 主版本(npx 里也是这个) |
| `@deepseek-ai/cordis` | `4.0.2` | 插件框架 |
| `@deepseek-ai/dsh-tools` | `0.1.2-rc.1` | `ctx.tools` + `ToolDefinition` |
| `@deepseek-ai/dsh-llm` | `0.1.2-rc.1` | prompt-optimize / message 构造 |
| `@deepseek-ai/dsh-scope` | `0.1.2-rc.1` | 参考(见 mcp-client 的 scopeOf) |
| `@deepseek-ai/dsh-mcp-client` | `0.1.2-rc.1` | 未直接依赖;作 ToolDefinition 注册参考 |

## 用到的 DSH API / 槽位

### 服务端(`index.js`)
| API | 用法 | 位置 |
|---|---|---|
| `inject` | `['skills', 'tools']` | 插件激活前置条件 |
| `ctx.skills.register(skill)` | 注册内置 SKILL.md 技能 | `apply()` |
| `ctx.tools.register(ToolDefinition)` | 注册进程内 hub 的 meta 工具 | `registerHubTools()` |
| `ctx.commands.register({name,description,input,handler})` + `ctx.inject(['commands'])` | `/prompt-optimize` 斜杠命令 | `apply()` |
| `ctx.effect(() => () => dispose)` | 资源注册/清理 | `apply()`、`registerHubTools()` |
| `ctx.reflect.get('webServer')` / `ctx.webServer.register({kind,path,handler})` | Hub Console 的 `/aipx-hub/*` 路由 | `startHubBridge()` |
| `ctx.logger.info/warn` | 日志 | 各处 |

### ToolDefinition 形状(手搓,不 import `defineTool`)
```js
{
  name,            // [A-Za-z0-9_-]{1,64}
  description,
  parameters,      // JSON schema: { type:'object', properties, required }
  output: {        // 必须声明
    schema,        // 返回值的 JSON schema
    render(args, value) -> ContentBlock[]   // 通常 [{ type:'text', text }]
  },
  async execute(args) -> 输出对应的 value
}
```
- 关键:我们**不 `import('@deepseek-ai/dsh-tools')`** —— bundle 无法解析宿主 node_modules;
  而是**直接构造这个对象**传给 `ctx.tools.register`(dsh-mcp-client 同法)。
- ContentBlock:`{ type:'text', text }`(至少;可能还有 image 等)。

### HTTP 路由 —— `ctx.webServer.register({kind:'exact', path, handler})`
`/aipx-hub/status|tools|search|config|optimize|model-catalog|servers|tools/toggle|settings|plugin-config`

### 客户端槽(`client.js`)
| 槽位 | 用途 | 位置 |
|---|---|---|
| `settings.plugins.tab` | Hub Console 面板(插件设置里的 tab) | `client.js` |

## 升级核对清单(DSH 发新版时逐项查)

1. **版本钉**是否仍匹配(profile 里 `@deepseek-ai/*` 版本,尤其 cordis)。
2. **skills 服务**:`ctx.skills.register` 签名 / 返回 disposer。
3. **tools 服务**:`ctx.tools.register(ToolDefinition)` 是否仍接受手搓对象;
   `output:{schema,render}`、`execute`、ContentBlock 形状是否变。
4. **commands 服务**:`ctx.inject(['commands'])` / `ctx.commands.register` 签名。
5. **webServer 服务**:`ctx.reflect.get('webServer')` / `register({kind,path,handler})`。
6. **cordis**:`inject` / `ctx.effect` / `ctx.logger` / `ctx.reflect`。
7. **客户端槽**:`settings.plugins.tab` 是否还在;想挪左侧导航要查 `settings.*` 的导航槽。
8. **llm/message**:prompt-optimize 用的 `@deepseek-ai/dsh-llm` `createUserMessage` / message 形状。

## 已知脆点
- **bundle 无法 import 宿主 `@deepseek-ai/*` 包** → 一律手搓对象 / 动态 import + catch。
  (这也是为什么 `registerHubTools` 不 `import('@deepseek-ai/dsh-tools')`)。
- **HTTP 下游的 `tools/list_changed` 通知暂不接**(SSE 长连接未做)→ 自动定向刷新目前只对 stdio 下游生效。
