/**
 * aipx hub console — the "browser half" of the dsh plugin (`ai-plugin-toolkit-dsh`).
 *
 * A lazy-CJS client module (same factory shape as
 * `@deepseek-ai/dsh-client-ui-settings-models/lib/client.js`, hand-written, zero
 * build). It contributes one tab ("Hub Console") to the Plugins settings section
 * via the `settings.plugins.tab` slot, and renders three blocks over the
 * same-origin `/aipx-hub/*` bridge served by the host half of this plugin:
 *
 *   1. Servers        — health table + an "Add server" disclosure form.
 *   2. Tool catalog   — the full mcp_search index, filterable client-side.
 *   3. Search playground — what the model sees when it calls `mcp_search`.
 *
 * The bridge may be absent (plugin not loaded, hub stopped): every fetch is
 * fault-tolerant and the panel degrades to an actionable "bridge not ready"
 * notice instead of a white screen. No polling — one load on mount, everything
 * else is the manual Refresh button.
 */
window.__ModuleLoader__.load({
	id: "ai-plugin-toolkit-dsh",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		/**
		* createElement alias: this file is hand-written (no JSX build step), and the
		* full name at every element would drown the structure it expresses.
		*/
		const h = react.createElement;
		//#region lib/client/HubConsole.css
		/**
		* Hand-authored stylesheet, injected once. Every class carries the `apxdsh-`
		* prefix (this is a plain stylesheet, not a CSS module), and every color is a
		* dsh theme alias (`--dsw-alias-*`) so the panel follows the active light/dark
		* theme instead of assuming a background. The one signature motion is the hub
		* status dot's breath; `prefers-reduced-motion` stills it.
		*/
		const css = ".apxdsh-root{display:flex;flex-direction:column;gap:24px;width:100%;max-width:1600px;margin:0 auto;min-width:0;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}.apxdsh-muted{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0}.apxdsh-code{font-family:var(--ds-font-family-code);font-size:.92em;background:var(--dsw-alias-bg-layer-1);border-radius:4px;padding:1px 5px}.apxdsh-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:0}.apxdsh-savedNotice{color:var(--dsw-alias-state-success-primary);font-size:12px;line-height:18px;margin:0}.apxdsh-statusRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.apxdsh-statusLabel{font-weight:500}.apxdsh-statusMeta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.apxdsh-refresh{margin-left:auto}.apxdsh-dot{box-sizing:border-box;border-radius:50%;width:8px;height:8px;flex:none;display:inline-block}.apxdsh-dotRunning{background:var(--dsw-alias-state-success-primary);animation:apxdsh-breathe 2.6s ease-in-out infinite}.apxdsh-dotStopped{background:var(--dsw-alias-state-error-primary)}.apxdsh-dotWarn{background:var(--dsw-alias-state-warn-label)}.apxdsh-dotIdle{background:var(--dsw-alias-border-l3)}.apxdsh-dotOk{background:var(--dsw-alias-state-success-primary)}@keyframes apxdsh-breathe{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.82)}}.apxdsh-section{display:flex;flex-direction:column;gap:10px;min-width:0}.apxdsh-sectionHead{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.apxdsh-sectionTitle{margin:0;font-size:14px;font-weight:500;line-height:22px}.apxdsh-sectionMeta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.apxdsh-intro{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0}.apxdsh-notice{display:flex;flex-direction:column;gap:4px;border:.5px solid var(--dsw-alias-border-l4);border-radius:10px;padding:12px 14px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.apxdsh-noticeTitle{color:var(--dsw-alias-state-warn-label);font-weight:500}.apxdsh-empty{border:1px dashed var(--dsw-alias-border-l3);border-radius:10px;padding:12px 14px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px;margin:0}.apxdsh-tableScroll{overflow-x:auto;min-width:0}.apxdsh-table{width:100%;border-collapse:collapse;font-size:13px}.apxdsh-table th{text-align:left;padding:6px 10px;border-bottom:.5px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500;line-height:16px;white-space:nowrap}.apxdsh-table td{padding:9px 10px;border-bottom:.5px solid var(--dsw-alias-border-l4);vertical-align:top}.apxdsh-table tbody tr:last-child td{border-bottom:none}.apxdsh-serverName{font-weight:500;white-space:nowrap}.apxdsh-serverCommand{font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.apxdsh-serverError{color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px;margin-top:2px;white-space:normal}.apxdsh-statusCell{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}.apxdsh-toolCount{font-family:var(--ds-font-family-code);font-size:12px}.apxdsh-actionCell{text-align:right;white-space:nowrap}.apxdsh-details{border:.5px solid var(--dsw-alias-border-l4);border-radius:12px;min-width:0}.apxdsh-summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;padding:10px 14px;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);border-radius:12px}.apxdsh-summary::-webkit-details-marker{display:none}.apxdsh-summary::before{content:\"\";width:5px;height:5px;flex:none;border-bottom:1.5px solid currentColor;border-right:1.5px solid currentColor;transform:rotate(-45deg) translate(-1px,-1px);transition:transform 120ms ease}.apxdsh-details[open]>.apxdsh-summary::before{transform:rotate(45deg) translate(-1px,-1px)}.apxdsh-summary:hover{background:var(--dsw-alias-interactive-bg-hover)}.apxdsh-summaryMeta{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400}.apxdsh-detailsBody{display:flex;flex-direction:column;gap:10px;padding:2px 14px 14px;min-width:0}.apxdsh-form{display:flex;flex-direction:column;gap:10px;min-width:0}.apxdsh-formGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.apxdsh-field{display:flex;flex-direction:column;gap:4px;min-width:0}.apxdsh-label{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px}.apxdsh-formActions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.apxdsh-hint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}.apxdsh-input{box-sizing:border-box;width:100%;height:32px;padding:0 10px;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l4);border-radius:8px}.apxdsh-input:focus{border-color:var(--dsw-alias-brand-primary);outline:none}.apxdsh-input::placeholder{color:var(--dsw-alias-label-dimmed)}.apxdsh-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:32px;padding:0 14px;border:none;border-radius:16px;font:inherit;font-size:13px;line-height:18px;cursor:pointer;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}.apxdsh-button:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.apxdsh-button:disabled{opacity:.4;cursor:default}.apxdsh-ghostButton{background:transparent;color:var(--dsw-alias-label-primary);border:.5px solid var(--dsw-alias-border-l3)}.apxdsh-ghostButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.apxdsh-dangerButton{background:transparent;color:var(--dsw-alias-state-error-primary);border:.5px solid var(--dsw-alias-border-l3)}.apxdsh-dangerButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}.apxdsh-smallButton{height:26px;padding:0 10px;font-size:12px;border-radius:13px}.apxdsh-button:focus-visible,.apxdsh-summary:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.apxdsh-toolList{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;max-height:320px;overflow-y:auto}.apxdsh-toolItem{display:flex;align-items:baseline;gap:10px;padding:5px 8px;border-radius:6px;min-width:0}.apxdsh-toolItem:hover{background:var(--dsw-alias-interactive-bg-hover)}.apxdsh-toolId{font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.apxdsh-toolDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.apxdsh-searchForm{display:flex;gap:8px;min-width:0}.apxdsh-searchForm .apxdsh-input{flex:1 1 auto;min-width:0}.apxdsh-searchForm .apxdsh-button{flex:none}.apxdsh-results{display:flex;flex-direction:column;gap:8px;min-width:0}.apxdsh-result{display:flex;flex-direction:column;gap:4px;border:.5px solid var(--dsw-alias-border-l4);border-radius:10px;padding:10px 12px;min-width:0}.apxdsh-resultHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}.apxdsh-resultName{font-weight:500;font-size:13px}.apxdsh-tag{border:.5px solid var(--dsw-alias-border-l3);border-radius:4px;padding:1px 6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code)}.apxdsh-score{margin-left:auto;font-family:var(--ds-font-family-code);font-size:11px;color:var(--dsw-alias-label-tertiary)}.apxdsh-resultDesc{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}@media (max-width:480px){.apxdsh-serverCommand{max-width:160px}}@media (prefers-reduced-motion:reduce){.apxdsh-dotRunning{animation:none}.apxdsh-summary::before{transition:none}}.apxdsh-toolToggle{flex:none;display:inline-flex;align-items:center;gap:6px;cursor:pointer}.apxdsh-toolItemDisabled .apxdsh-toolId,.apxdsh-toolItemDisabled .apxdsh-toolDesc{opacity:.45;text-decoration:line-through}.apxdsh-engineRow{display:flex;gap:8px;min-width:0}.apxdsh-engineRow .apxdsh-input{flex:1 1 auto}.apxdsh-dock{display:flex;align-items:center;margin:-33px 0 30px 150px;width:fit-content;position:relative;z-index:6;pointer-events:none}.apxdsh-dock>*{pointer-events:auto}.apxdsh-dockButton{display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border:none;border-radius:13px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:16px;cursor:pointer}.apxdsh-dockButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.apxdsh-dockButton:disabled{opacity:.5;cursor:default}.apxdsh-dockButton:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.apxdsh-dockBusy{color:var(--dsw-alias-brand-primary)}.apxdsh-dockError{color:var(--dsw-alias-state-error-primary)}";
		const tagId = "ai-plugin-toolkit-dsh/HubConsole.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "ai-plugin-toolkit-dsh";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		/**
		* Second sheet: the 插件设置 panel widgets and the optimize busy spinner.
		* Kept apart from the main sheet purely so this diff stays readable — same
		* rules apply (apxdsh- prefix, theme aliases, reduced-motion).
		*/
		const cssAdd = ".apxdsh-switchRow{display:flex;flex-direction:row;align-items:center;gap:10px;width:100%;padding:8px 12px;border:.5px solid var(--dsw-alias-border-l4);border-radius:10px;min-width:0}.apxdsh-switchText{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}.apxdsh-switchLabel{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);line-height:18px}.apxdsh-switchHint{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:16px}.apxdsh-check{flex:none;accent-color:var(--dsw-alias-brand-primary)}.apxdsh-subOptions{display:flex;flex-direction:column;gap:12px;padding-left:24px;min-width:0}.apxdsh-inlineRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}.apxdsh-select{box-sizing:border-box;height:32px;padding:0 10px;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l4);border-radius:8px}.apxdsh-select:focus{border-color:var(--dsw-alias-brand-primary);outline:none}.apxdsh-textarea{box-sizing:border-box;width:100%;min-height:96px;padding:8px 10px;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l4);border-radius:8px;resize:vertical}.apxdsh-textarea:focus{border-color:var(--dsw-alias-brand-primary);outline:none}.apxdsh-textarea::placeholder{color:var(--dsw-alias-label-dimmed)}.apxdsh-tplList{display:flex;flex-direction:column;gap:6px;min-width:0}.apxdsh-tplRow{display:flex;align-items:center;gap:8px;padding:6px 10px;border:.5px solid var(--dsw-alias-border-l4);border-radius:10px;min-width:0}.apxdsh-tplName{flex:none;max-width:180px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}.apxdsh-tplPreview{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--dsw-alias-label-tertiary)}.apxdsh-activeTag{flex:none;border:.5px solid var(--dsw-alias-border-l3);border-radius:4px;padding:0 6px;font-size:11px;line-height:16px;color:var(--dsw-alias-state-success-primary)}.apxdsh-tplActions{display:flex;gap:6px;flex:none}.apxdsh-spin{width:10px;height:10px;flex:none;display:inline-block;border:1.5px solid currentColor;border-top-color:transparent;border-radius:50%;animation:apxdsh-spin .8s linear infinite;vertical-align:middle}@keyframes apxdsh-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion: reduce){.apxdsh-spin{animation:none}}.VOzbGW_panel{width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;border-radius:0!important}.apxdsh-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px;width:100%;align-items:start}.apxdsh-grid>.apxdsh-section,.apxdsh-grid>details,.apxdsh-grid>.apxdsh-tableScroll{min-width:0}";
		const tagIdAdd = "ai-plugin-toolkit-dsh/HubConsoleAdd.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagIdAdd) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "ai-plugin-toolkit-dsh";
			tag.dataset.pluginCss = tagIdAdd;
			tag.textContent = cssAdd;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region lib/client/presets.js
		// Curated MCP server presets for one-click add. Every entry was
		// verified against its live registry (npm/PyPI/remote endpoint);
		// deprecated packages are deliberately excluded. {PLACEHOLDER} tokens
		// in args become labeled inputs at add time; needsSecret entries hint
		// the env field.
		const PRESETS = [
			{ id: "filesystem", label: "Filesystem", kind: "command", command: "npx",
				args: ["-y", "@modelcontextprotocol/server-filesystem", "{DIR}"],
				needsInput: [{ placeholder: "{DIR}", label: "允许访问的目录", defaultValue: "/tmp" }],
				needsSecret: [],
				description: "官方文件系统服务器：在指定目录内读写、搜索、移动文件" },
			{ id: "memory", label: "Memory", kind: "command", command: "npx",
				args: ["-y", "@modelcontextprotocol/server-memory"],
				needsInput: [], needsSecret: [],
				description: "官方知识图谱记忆服务器：跨会话记住实体与关系" },
			{ id: "sequential-thinking", label: "Sequential Thinking", kind: "command", command: "npx",
				args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
				needsInput: [], needsSecret: [],
				description: "官方分步思考服务器：动态推理、修订与分支" },
			{ id: "fetch", label: "Fetch (网页抓取)", kind: "command", command: "uvx",
				args: ["mcp-server-fetch"],
				needsInput: [], needsSecret: [],
				description: "官方网页抓取服务器（Python，需本机安装 uv/uvx）" },
			{ id: "playwright", label: "Playwright", kind: "command", command: "npx",
				args: ["-y", "@playwright/mcp"],
				needsInput: [], needsSecret: [],
				description: "微软官方 Playwright MCP：浏览器自动化与无障碍树访问" },
			{ id: "brave-search", label: "Brave Search", kind: "command", command: "npx",
				args: ["-y", "@brave/brave-search-mcp-server", "--transport", "stdio"],
				needsInput: [],
				needsSecret: ["BRAVE_API_KEY"],
				description: "Brave 官方搜索服务器：网页/图片/新闻搜索（需免费 API key）" },
			{ id: "notion", label: "Notion", kind: "command", command: "npx",
				args: ["-y", "@notionhq/notion-mcp-server"],
				needsInput: [],
				needsSecret: ["NOTION_TOKEN"],
				description: "Notion 官方 MCP：搜索、读取、创建和更新页面与数据库（env NOTION_TOKEN=ntn_…）" },
			{ id: "github", label: "GitHub (官方远程)", kind: "http", url: "https://api.githubcopilot.com/mcp/",
				needsInput: [], needsSecret: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
				description: "GitHub 官方远程 MCP：issues、PR、仓库、Actions（PAT 走 Authorization 头）" },
			{ id: "supabase", label: "Supabase", kind: "http", url: "https://mcp.supabase.com/mcp",
				needsInput: [], needsSecret: [],
				description: "Supabase 官方远程 MCP：查询 Postgres、管理 schema（OAuth 登录）" }
		];
		//#endregion
		//#region lib/client/bridge.js
		/**
		* The host-half bridge lives on the dsh webserver's own origin, so plain
		* same-origin fetch is enough — no client remote namespaces involved.
		*/
		const BRIDGE_BASE = "/aipx-hub";
		/** One shot, not a conversation: a stalled bridge answers or gets abandoned.
		 * 15s tolerates a first-load downstream (npx -y) boot; the hub caches after. */
		const REQUEST_TIMEOUT_MS = 15000;
		/** Playground result cap — mirrors what a model tolerates before skimming. */
		const SEARCH_LIMIT = 8;
		/** Tool rows rendered per filter pass; the note under the list explains the cap. */
		const TOOL_RENDER_CAP = 200;
		/** A string field, or the fallback when absent or not a string. */
		function stringOr(value, fallback) {
			return typeof value === "string" ? value : fallback;
		}
		/** Human-readable `error` field from a JSON error body, if any. */
		function jsonErrorDetail(text) {
			if (text.trim().length === 0) return null;
			try {
				return stringOr(JSON.parse(text)?.error, null);
			} catch {
				return null;
			}
		}
		/**
		* One same-origin call to the hub bridge. Never throws: every failure mode
		* (network, timeout, HTTP status, non-JSON body) becomes an `{ ok: false }`
		* answer the panel can render as guidance instead of a white screen.
		*/
		async function bridgeRequest(path, options) {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
			let response;
			try {
				response = await fetch(BRIDGE_BASE + path, {
					method: options?.method ?? "GET",
					headers: options?.body === undefined ? void 0 : { "content-type": "application/json" },
					body: options?.body === undefined ? void 0 : JSON.stringify(options.body),
					signal: controller.signal,
					credentials: "same-origin"
				});
			} catch (error) {
				return { ok: false, error: error?.name === "AbortError" ? "请求超时（8s）" : "网络请求失败" };
			} finally {
				clearTimeout(timer);
			}
			let text = "";
			try {
				text = await response.text();
			} catch {}
			if (!response.ok) {
				const detail = jsonErrorDetail(text);
				return { ok: false, error: `HTTP ${String(response.status)}${detail === null ? "" : `：${detail}`}` };
			}
			if (text.trim().length === 0) return { ok: true, value: {} };
			try {
				return { ok: true, value: JSON.parse(text) };
			} catch {
				return { ok: false, error: "响应不是 JSON" };
			}
		}
		//#endregion
		//#region lib/client/normalize.js
		/**
		* Wire shapes are trusted only after these narrowings: the bridge is
		* independently implemented (the host half), and a shape drift must read as
		* "host half not ready", never as a crashed panel.
		*/
		function normalizeStatus(value) {
			if (typeof value !== "object" || value === null) return null;
			const rawList = Array.isArray(value.servers)
				? value.servers.map((entry) => [typeof entry?.name === "string" ? entry.name : "", entry])
				: Object.entries(typeof value.servers === "object" && value.servers !== null ? value.servers : {});
			const servers = {};
			for (const [name, entry] of rawList) {
				if (typeof entry !== "object" || entry === null) continue;
				const ok = entry.status === "ok" || entry.ready === true;
				servers[name] = ok
					? { state: "ok", tools: typeof entry.tools === "number" ? entry.tools : null }
					: { state: "error", error: stringOr(entry.error, "未知错误") };
			}
			return {
				running: value.running === true,
				pid: typeof value.pid === "number" ? value.pid : null,
				servers,
				searchEngine: typeof value.engine === "string"
					? value.engine
					: typeof value.searchEngine === "string"
						? value.searchEngine
						: null
			};
		}
		function normalizeConfig(value) {
			if (typeof value !== "object" || value === null) return null;
			const raw = typeof value.servers === "object" && value.servers !== null ? value.servers : {};
			const servers = {};
			for (const name of Object.keys(raw)) {
				const def = raw[name];
				if (typeof def !== "object" || def === null) continue;
				servers[name] = {
					command: stringOr(def.command, ""),
					args: Array.isArray(def.args) ? def.args.filter((part) => typeof part === "string") : [],
					env: typeof def.env === "object" && def.env !== null ? def.env : {}
				};
			}
			return {
				servers,
				disabledTools: Array.isArray(value.disabledTools)
					? value.disabledTools.filter((id) => typeof id === "string" && id.length > 0)
					: [],
				sidecar: value.search !== null && typeof value.search === "object" && typeof value.search.sidecar === "string"
					? value.search.sidecar
					: null
			};
		}
		function normalizeTools(value) {
			if (typeof value !== "object" || value === null || !Array.isArray(value.tools)) return null;
			return value.tools
				.map((tool) => ({
					id: stringOr(tool?.id, ""),
					server: stringOr(tool?.server, ""),
					name: stringOr(tool?.name, stringOr(tool?.id, "")),
					description: stringOr(tool?.description, "")
				}))
				.filter((tool) => tool.id.length > 0);
		}
		/**
		* Join the three answers into one server row list: config gives identity and
		* command, status gives health, the tool catalog gives per-server counts.
		* A name visible in only one source still renders (state `unknown` when the
		* status half is missing), because partial fact > silent omission.
		*/
		function serverRows(data) {
			const configServers = data.config === null ? {} : data.config.servers;
			const statusServers = data.status === null ? {} : data.status.servers;
			const counts = /* @__PURE__ */ new Map();
			for (const tool of data.tools ?? []) counts.set(tool.server, (counts.get(tool.server) ?? 0) + 1);
			const names = [...new Set([...Object.keys(configServers), ...Object.keys(statusServers)])];
			return names.map((name) => {
				const def = configServers[name];
				const health = statusServers[name];
				const count = counts.get(name) ?? (health !== void 0 && health.state === "ok" ? health.tools : null);
				return {
					name,
					def: def === void 0 ? null : def,
					state: health === void 0 ? "unknown" : health.state,
					error: health !== void 0 && health.state !== "ok" ? health.error : null,
					tools: count
				};
			});
		}
		/** Command line preview: binary plus args, one string. */
		function commandOverview(def) {
			if (def === null) return null;
			return [def.command, ...def.args].join(" ");
		}
		/** Static status dot + short text for one server row. */
		function serverStateView(state) {
			if (state === "ok") return { dot: "apxdsh-dot apxdsh-dotOk", text: "ok" };
			if (state === "error") return { dot: "apxdsh-dot apxdsh-dotStopped", text: "error" };
			return { dot: "apxdsh-dot apxdsh-dotIdle", text: "—" };
		}
		//#endregion
		//#region lib/client/StatusRow.js
		/**
		* The one always-visible line: is the hub alive, and how do I fix it if not.
		* The running dot is the panel's single signature element — everything else
		* stays still.
		*/
		function StatusRow(props) {
			const { data, refreshing, onRefresh } = props;
			let dotClass;
			let label;
			let meta = null;
			if (data.statusError !== null) {
				dotClass = "apxdsh-dot apxdsh-dotWarn";
				label = "Bridge unreachable";
				meta = "无法连接 /aipx-hub 接口";
			} else if (data.status === null) {
				dotClass = "apxdsh-dot apxdsh-dotIdle";
				label = "Checking hub…";
			} else if (data.status.running) {
				dotClass = "apxdsh-dot apxdsh-dotRunning";
				label = "Running";
				meta = data.status.pid === null ? null : `pid ${String(data.status.pid)}`;
			} else {
				dotClass = "apxdsh-dot apxdsh-dotStopped";
				label = "Stopped";
				meta = "在下方 Servers 表单注册服务器后，hub 会自动随首次请求启动";
			}
			return (0, h)("div", { className: "apxdsh-statusRow", role: "status" },
				(0, h)("span", { className: dotClass, "aria-hidden": true }),
				(0, h)("span", { className: "apxdsh-statusLabel" }, label),
				meta !== null ? (0, h)("span", { className: "apxdsh-statusMeta" }, meta) : null,
				(0, h)("button", {
					type: "button",
					className: "apxdsh-button apxdsh-ghostButton apxdsh-refresh",
					disabled: refreshing,
					"aria-label": "Refresh hub status",
					onClick: onRefresh
				}, refreshing ? "Refreshing…" : "Refresh")
			);
		}
		//#endregion
		//#region lib/client/AddServerForm.js
		/**
		* The "Add server" disclosure. Each failure names the field and the fix while
		* the user is still looking at it; success collapses the form and lets the
		* refreshed table be the confirmation.
		*/
		function AddServerForm(props) {
			const [name, setName] = (0, react.useState)("");
			const [overwriteOk, setOverwriteOk] = (0, react.useState)(false);
			const [transport, setTransport] = (0, react.useState)("command");
			const [command, setCommand] = (0, react.useState)("");
			const [args, setArgs] = (0, react.useState)("");
			const [url, setUrl] = (0, react.useState)("");
			const [headers, setHeaders] = (0, react.useState)("");
			const [env, setEnv] = (0, react.useState)("");
			const [presetId, setPresetId] = (0, react.useState)("");
			const [presetInputs, setPresetInputs] = (0, react.useState)({});
			const activePreset = presetId ? PRESETS.find((x) => x.id === presetId) : null;
			const activeSecret = activePreset?.needsSecret?.[0] ?? null;
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(void 0);
			const detailsRef = (0, react.useRef)(null);
			// "KEY=VALUE" 逗号分隔 → 对象；解析不了的条目跳过
			const parseEnv = (text) => {
				const out = {};
				for (const part of String(text).split(",")) {
					const eq = part.indexOf("=");
					if (eq <= 0) continue;
					const key = part.slice(0, eq).trim();
					const value = part.slice(eq + 1).trim();
					if (key) out[key] = value;
				}
				return out;
			};
			const applyPreset = (id) => {
				setPresetId(id);
				const preset = PRESETS.find((x) => x.id === id);
				setPresetInputs(Object.fromEntries((preset?.needsInput ?? []).map((inp) => {
					const key = inp.placeholder.replace(/[{}]/g, "");
					return [key, inp.defaultValue ?? ""];
				})));
				if (!preset) return;
				setTransport(preset.kind === "http" ? "url" : "command");
				setUrl(preset.url ?? "");
				setCommand(preset.command ?? "");
				setArgs(preset.args ? preset.args.join(", ") : "");
			};
			const submit = async (event) => {
				event.preventDefault();
				const trimmedName = name.trim();
				if (trimmedName.length === 0) {
					setError("Name 必填——它同时是表格里的名字和工具 id 的 server 归属。");
					return;
				}
				if (/\s/.test(trimmedName)) {
					setError("Name 不能包含空格，用 - 或 _ 连接，例如 my-server。");
					return;
				}
				const isDuplicate = (props.existingNames ?? []).includes(trimmedName);
				if (isDuplicate && !overwriteOk) {
					setOverwriteOk(true);
					setError(`「${trimmedName}」已存在——再次提交将覆盖它的定义。`);
					return;
				}
				setOverwriteOk(false);
				const byUrl = transport === "url";
				if (byUrl && !/^https?:\/\//.test(url.trim())) {
					setError("URL 必填且以 http:// 或 https:// 开头（streamable-HTTP 传输）。");
					return;
				}
				if (!byUrl && command.trim().length === 0) {
					setError("Command 必填，例如 npx -y @some/mcp-server。");
					return;
				}
				const resolvePlaceholder = (text) => String(text).replace(/\{(\w+)\}/g, (m, key) => {
					const val = (presetInputs[key] ?? "").trim();
					if (val !== "") return val;
					const def = (activePreset?.needsInput ?? []).find((inp) => inp.placeholder.replace(/[{}]/g, "") === key);
					return def?.defaultValue ?? m;
				});
				const parsedArgs = args.split(",").map((part) => resolvePlaceholder(part.trim())).filter((part) => part.length > 0);
				const parsedEnv = {};
				for (const [k, v] of Object.entries(parseEnv(env))) parsedEnv[resolvePlaceholder(k)] = resolvePlaceholder(v);
				// 头部值里常有冒号（如 https://、Bearer xx），按第一个冒号切
				const parsedHeaders = {};
				for (const part of headers.split(",")) {
					const colon = part.indexOf(":");
					if (colon <= 0) continue;
					const key = part.slice(0, colon).trim();
					const value = part.slice(colon + 1).trim();
					if (key) parsedHeaders[key] = value;
				}
				const def = byUrl
					? { url: url.trim(), ...(Object.keys(parsedHeaders).length > 0 ? { headers: parsedHeaders } : {}) }
					: { command: command.trim(), args: parsedArgs, ...(Object.keys(parsedEnv).length > 0 ? { env: parsedEnv } : {}) };
				setBusy(true);
				setError(void 0);
				const answer = await bridgeRequest("/servers", {
					method: "POST",
					body: { action: "add", name: trimmedName, def }
				});
				setBusy(false);
				if (!answer.ok) {
					setError(`添加失败：${answer.error}。确认命令在本机可执行后重试。`);
					return;
				}
				if (typeof answer.value === "object" && answer.value !== null && answer.value.ok === false) {
					setError(`添加失败：${stringOr(answer.value.error, "hub 拒绝了该定义")}。检查 command 与 args 后重试。`);
					return;
				}
				setName("");
				setCommand("");
				setArgs("");
				setUrl("");
				setEnv("");
				setHeaders("");
				if (detailsRef.current !== null) detailsRef.current.open = false;
				props.onAdded(trimmedName);
			};
			return (0, h)("details", { className: "apxdsh-details", ref: detailsRef },
				(0, h)("summary", { className: "apxdsh-summary" }, "Add server"),
				(0, h)("div", { className: "apxdsh-detailsBody" },
					(0, h)("form", { className: "apxdsh-form", onSubmit: (event) => { void submit(event); }, noValidate: true },
						(0, h)("div", { className: "apxdsh-formGrid" },
							(0, h)("label", { className: "apxdsh-field" },
								(0, h)("span", { className: "apxdsh-label" }, "From catalog"),
								(0, h)("select", {
									className: "apxdsh-input",
									value: presetId,
									disabled: busy,
									onChange: (event) => { applyPreset(event.target.value); }
								},
									(0, h)("option", { value: "" }, "Custom (fill in yourself)"),
									PRESETS.map((preset) => (0, h)("option", { key: preset.id, value: preset.id }, `${preset.label} — ${preset.description.slice(0, 30)}…`))
								)
							),
							(presetId !== "" && (PRESETS.find((x) => x.id === presetId)?.needsInput ?? []).length > 0)
								? PRESETS.find((x) => x.id === presetId).needsInput.map((inp) => (0, h)("label", { className: "apxdsh-field", key: inp.placeholder },
									(0, h)("span", { className: "apxdsh-label" }, inp.label),
									(0, h)("input", {
										className: "apxdsh-input",
										type: "text",
										value: presetInputs[inp.placeholder] ?? inp.defaultValue ?? "",
										placeholder: inp.placeholder,
										onChange: (event) => { setPresetInputs({ ...presetInputs, [inp.placeholder.replace(/[{}]/g, "")]: event.target.value }); }
									})
								))
								: null,
							(0, h)("label", { className: "apxdsh-field" },
								(0, h)("span", { className: "apxdsh-label" }, "Transport"),
								(0, h)("select", {
									className: "apxdsh-input",
									value: transport,
									disabled: busy,
									onChange: (event) => { setTransport(event.target.value); }
								},
									(0, h)("option", { value: "command" }, "Command (stdio)"),
									(0, h)("option", { value: "url" }, "URL (streamable-HTTP)")
								)
							),
							(0, h)("label", { className: "apxdsh-field" },
								(0, h)("span", { className: "apxdsh-label" }, "Name"),
								(0, h)("input", {
									className: "apxdsh-input",
									type: "text",
									value: name,
									placeholder: "my-server",
									disabled: busy,
onChange: (event) => { setName(event.target.value); setOverwriteOk(false); }
								})
							),
							transport === "command" ? (0, h)("label", { className: "apxdsh-field" },
								(0, h)("span", { className: "apxdsh-label" }, "Command"),
								(0, h)("input", {
									className: "apxdsh-input",
									type: "text",
									value: command,
									placeholder: "npx -y @some/mcp-server",
									disabled: busy,
									onChange: (event) => { setCommand(event.target.value); }
								})
							) : (0, h)("label", { className: "apxdsh-field" },
								(0, h)("span", { className: "apxdsh-label" }, "URL"),
								(0, h)("input", {
									className: "apxdsh-input",
									type: "url",
									value: url,
									placeholder: "https://mcp.example.com/mcp",
									disabled: busy,
									onChange: (event) => { setUrl(event.target.value); }
								})
							),
							transport === "command" ? (0, h)("label", { className: "apxdsh-field" },
								(0, h)("span", { className: "apxdsh-label" }, "Args"),
								(0, h)("input", {
									className: "apxdsh-input",
									type: "text",
									value: args,
									placeholder: "逗号分隔，如 --port, 8080",
									disabled: busy,
									onChange: (event) => { setArgs(event.target.value); }
								})
							) : null,
							(0, h)("label", { className: "apxdsh-field" },
								(0, h)("span", { className: "apxdsh-label" }, "Headers"),
								(0, h)("input", {
									className: "apxdsh-input",
									type: "text",
									value: headers,
									placeholder: "Authorization: Bearer xxx, X-Api-Key: yyy",
									disabled: busy,
									onChange: (event) => { setHeaders(event.target.value); }
								})
							),
							(0, h)("label", { className: "apxdsh-field" },
								(0, h)("span", { className: "apxdsh-label" }, "Env"),
								(0, h)("input", {
									className: "apxdsh-input",
									type: "text",
									value: env,
									placeholder: activeSecret ? `${activeSecret}=你的密钥` : "KEY=VALUE, KEY2=VALUE2",
									disabled: busy,
									onChange: (event) => { setEnv(event.target.value); }
								})
							)
						),
						error !== void 0 ? (0, h)("p", { className: "apxdsh-error", role: "alert" }, error) : null,
						(0, h)("div", { className: "apxdsh-formActions" },
							(0, h)("button", { type: "submit", className: "apxdsh-button", disabled: busy }, busy ? "Adding…" : "Add server"),
							(0, h)("span", { className: "apxdsh-hint" }, "args 用英文逗号分隔；需要 env 时用 aipx mcp add 在终端配置。")
						)
					)
				)
			);
		}
		//#endregion
		//#region lib/client/ServersSection.js
		/**
		* Registered servers: one health row each, plus the add form. Removal is a
		* two-click confirm (the button itself becomes the confirm), so no modal and
		* no window.confirm — and it re-arms on its own after four seconds.
		*/
		function ServersSection(props) {
			const { data, onRefresh } = props;
			const rows = serverRows(data);
			const [busyName, setBusyName] = (0, react.useState)(null);
			const [pendingRemove, setPendingRemove] = (0, react.useState)(null);
			const [mutationError, setMutationError] = (0, react.useState)(void 0);
			const [notice, setNotice] = (0, react.useState)(void 0);
			(0, react.useEffect)(() => {
				if (pendingRemove === null) return;
				const timer = setTimeout(() => { setPendingRemove(null); }, 4000);
				return () => { clearTimeout(timer); };
			}, [pendingRemove]);
			const remove = async (name) => {
				if (pendingRemove !== name) {
					setPendingRemove(name);
					return;
				}
				setPendingRemove(null);
				setBusyName(name);
				setMutationError(void 0);
				const answer = await bridgeRequest("/servers", { method: "POST", body: { action: "remove", name } });
				setBusyName(null);
				if (!answer.ok) {
					setMutationError(`移除失败：${answer.error}。服务器仍保留在配置里，可重试。`);
					return;
				}
				if (typeof answer.value === "object" && answer.value !== null && answer.value.ok === false) {
					setMutationError(`移除失败：${stringOr(answer.value.error, "hub 拒绝了该操作")}。服务器仍保留在配置里，可重试。`);
					return;
				}
				setNotice(`已移除 ${name}。`);
				void onRefresh();
			};
			return (0, h)("section", { className: "apxdsh-section", "aria-label": "Servers" },
				(0, h)("div", { className: "apxdsh-sectionHead" },
					(0, h)("h3", { className: "apxdsh-sectionTitle" }, "Servers"),
					rows.length > 0 ? (0, h)("span", { className: "apxdsh-sectionMeta" }, `${String(rows.length)} registered`) : null
				),
				data.configError !== null ? (0, h)("p", { className: "apxdsh-error", role: "alert" }, `服务器配置读取失败：${data.configError}。点顶部 Refresh 重试；下方表单不受影响。`) : null,
				mutationError !== void 0 ? (0, h)("p", { className: "apxdsh-error", role: "alert" }, mutationError) : null,
				notice !== void 0 ? (0, h)("p", { className: "apxdsh-savedNotice", role: "status" }, notice) : null,
				rows.length === 0
					? (0, h)("p", { className: "apxdsh-empty" },
						"还没有注册任何服务器——在终端运行 ",
						(0, h)("code", { className: "apxdsh-code" }, "aipx mcp add <名字> -- <命令>"),
						"，或展开下方表单添加。")
					: (0, h)("div", { className: "apxdsh-tableScroll" },
						(0, h)("table", { className: "apxdsh-table" },
							(0, h)("thead", null,
								(0, h)("tr", null,
									(0, h)("th", { scope: "col" }, "Server"),
									(0, h)("th", { scope: "col" }, "Command"),
									(0, h)("th", { scope: "col" }, "Status"),
									(0, h)("th", { scope: "col" }, "Tools"),
									(0, h)("th", { scope: "col", "aria-label": "Actions" })
								)
							),
							(0, h)("tbody", null, rows.map((row) => {
								const overview = commandOverview(row.def);
								const stateView = serverStateView(row.state);
								return (0, h)("tr", { key: row.name },
									(0, h)("td", { className: "apxdsh-serverName" }, row.name),
									(0, h)("td", null,
										overview === null
											? (0, h)("span", { className: "apxdsh-muted", title: "配置不可见——读取 /aipx-hub/config 失败或该服务器由其他来源注册" }, "—")
											: (0, h)("div", { className: "apxdsh-serverCommand", title: overview }, overview),
										row.error !== null ? (0, h)("div", { className: "apxdsh-serverError" }, row.error) : null
									),
									(0, h)("td", null,
										(0, h)("span", { className: "apxdsh-statusCell" },
											(0, h)("span", { className: stateView.dot, "aria-hidden": true }),
											stateView.text
										)
									),
									(0, h)("td", { className: "apxdsh-toolCount" }, row.tools === null ? "—" : String(row.tools)),
									(0, h)("td", { className: "apxdsh-actionCell" },
										(0, h)("button", {
											type: "button",
											className: "apxdsh-button apxdsh-dangerButton apxdsh-smallButton",
											disabled: busyName !== null,
											"aria-label": `Remove server ${row.name}`,
											onClick: () => { void remove(row.name); }
										}, pendingRemove === row.name ? "确认移除" : "Remove")
									)
								);
							}))
						)
					),
				(0, h)(InstallMcp, {
					existingNames: rows.map((row) => row.name),
					onAdded: () => { void onRefresh(); }
				})
			);
		}
		//#endregion
		//#region lib/client/ToolsSection.js
		/**
		* The full mcp_search index, behind a disclosure because 384 rows should not
		* greet anyone. The filter box narrows client-side (id, name, server,
		* description); rendering is capped so a huge index still scrolls smoothly,
		* and the cap says so instead of silently hiding rows.
		*/
		function ToolsSection(props) {
			const { data, onRefresh } = props;
			const [filter, setFilter] = (0, react.useState)("");
			const [toggleBusyId, setToggleBusyId] = (0, react.useState)(null);
			const [toggleError, setToggleError] = (0, react.useState)(null);
			const onToggleTool = async (id, disable) => {
				setToggleBusyId(id);
				setToggleError(null);
				const answer = await bridgeRequest("/tools/toggle", { method: "POST", body: { id, disabled: disable } });
				setToggleBusyId(null);
				if (!answer.ok) {
					setToggleError(answer.error);
					return;
				}
				await onRefresh();
			};
			const tools = data.tools;
			const disabledIds = data.config === null ? [] : data.config.disabledTools;
			// 目录只含启用中的工具；已停用的从配置侧补进来，否则无法重新启用
			const rows = tools === null
				? []
				: [
					...tools.map((tool) => ({ ...tool, disabled: disabledIds.includes(tool.id) })),
					...disabledIds
						.filter((id) => !tools.some((tool) => tool.id === id))
						.map((id) => ({ id, server: id.split("/")[0] ?? "", name: id, description: "已停用——不出现在模型可见目录中", disabled: true }))
				];
			const normalized = filter.trim().toLowerCase();
			const filtered = tools === null
				? []
				: normalized.length === 0
					? rows
					: rows.filter((tool) => tool.id.toLowerCase().includes(normalized)
						|| tool.name.toLowerCase().includes(normalized)
						|| tool.server.toLowerCase().includes(normalized)
						|| tool.description.toLowerCase().includes(normalized));
			const visible = filtered.slice(0, TOOL_RENDER_CAP);
			return (0, h)("details", { className: "apxdsh-details" },
				(0, h)("summary", { className: "apxdsh-summary" },
					(0, h)("span", null, "Tool catalog"),
					tools !== null ? (0, h)("span", { className: "apxdsh-summaryMeta" }, `${String(tools.length)} tools`) : null
				),
				(0, h)("div", { className: "apxdsh-detailsBody" },
					tools === null
						? (0, h)("p", { className: "apxdsh-muted", role: "status" },
							data.toolsError !== null ? `工具目录加载失败：${data.toolsError}。点顶部 Refresh 重试。` : "加载中…")
						: (0, h)(react.Fragment, null,
							(0, h)("input", {
								className: "apxdsh-input",
								type: "search",
								value: filter,
								placeholder: "Filter tools…",
								"aria-label": "Filter tools",
								onChange: (event) => { setFilter(event.target.value); }
							}),
							(0, h)("p", { className: "apxdsh-muted" },
								filtered.length === rows.length
									? `${String(rows.length)} tools`
									: `${String(filtered.length)} / ${String(rows.length)} tools`),
							toggleError !== null ? (0, h)("p", { className: "apxdsh-error" }, `启停失败：${toggleError}`) : null,
							filtered.length === 0
								? (0, h)("p", { className: "apxdsh-empty" },
									`没有匹配「${filter.trim()}」的工具——清空过滤框查看全部 ${String(rows.length)} 条。`)
								: (0, h)("ul", { className: "apxdsh-toolList" },
									visible.map((tool) => (0, h)("li", {
										className: tool.disabled ? "apxdsh-toolItem apxdsh-toolItemDisabled" : "apxdsh-toolItem",
										key: tool.id,
										title: tool.description.length > 0 ? `${tool.id} — ${tool.description}` : tool.id
									},
										(0, h)("label", { className: "apxdsh-toolToggle", title: tool.disabled ? "已停用——勾选以重新启用" : "取消勾选可停用：模型将看不到该工具" },
											(0, h)("input", {
												type: "checkbox",
												checked: !tool.disabled,
												disabled: toggleBusyId !== null,
												"aria-label": (tool.disabled ? "启用 " : "停用 ") + tool.id,
												onChange: () => { void onToggleTool(tool.id, !tool.disabled); }
											})
										),
										(0, h)("span", { className: "apxdsh-toolId" }, tool.id),
										(0, h)("span", { className: "apxdsh-toolDesc" }, tool.description.length > 0 ? tool.description : "（无描述）")
									)),
									filtered.length > visible.length
										? (0, h)("li", { className: "apxdsh-muted" }, `已显示前 ${String(TOOL_RENDER_CAP)} 条——继续输入过滤条件以缩小范围。`)
										: null
								)
						)
				)
			);
		}
		//#endregion
		//#region lib/client/EngineSection.js
		/**
		* Retrieval engine control: the hub ships with the built-in lexical index;
		* a sidecar command (e.g. the zvec hybrid sidecar) upgrades mcp_search and
		* falls back to lexical on any failure. Persisted as search.sidecar.
		*/
		function EngineSection(props) {
			const { data, onRefresh } = props;
			const configSidecar = data.config === null ? null : data.config.sidecar;
			const serving = data.status === null ? null : data.status.searchEngine ?? null;
			const [value, setValue] = (0, react.useState)("");
			const [dirty, setDirty] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [saved, setSaved] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (!dirty) setValue(configSidecar ?? "");
			}, [configSidecar, dirty]);
			const save = async (sidecar) => {
				setBusy(true);
				setError(null);
				setSaved(null);
				const answer = await bridgeRequest("/settings", { method: "POST", body: { sidecar } });
				setBusy(false);
				if (!answer.ok) {
					setError(answer.error);
					return;
				}
				setDirty(false);
				setSaved(sidecar === null ? "已恢复内置词法检索" : "检索引擎已更新");
				await onRefresh();
			};
			return (0, h)("details", { className: "apxdsh-details" },
				(0, h)("summary", { className: "apxdsh-summary" },
					(0, h)("span", null, "Search engine"),
					(0, h)("span", { className: "apxdsh-summaryMeta" },
						serving !== null
							? `serving: ${serving}`
							: configSidecar === null
								? "lexical (built-in)"
								: "custom sidecar configured")),
				(0, h)("div", { className: "apxdsh-detailsBody" },
					(0, h)("p", { className: "apxdsh-intro" },
						"默认内置词法检索，零依赖。填入 sidecar 命令（如 zvec 混合检索）后 mcp_search 自动升级；sidecar 失败时自动回退词法，服务不中断。"),
					(0, h)("div", { className: "apxdsh-engineRow" },
						(0, h)("input", {
							className: "apxdsh-input",
							value: value,
							placeholder: "python3 /path/to/sidecar.py",
							"aria-label": "Sidecar command",
							onChange: (event) => { setValue(event.target.value); setDirty(true); }
						}),
						(0, h)("button", {
							className: "apxdsh-button apxdsh-smallButton",
							disabled: busy || !dirty,
							onClick: () => { void save(value.trim() || null); }
						}, "Save")),
					(0, h)("div", { className: "apxdsh-formActions" },
						(0, h)("button", {
							className: "apxdsh-ghostButton apxdsh-smallButton",
							disabled: busy || configSidecar === null,
							onClick: () => { void save(null); }
						}, "Use built-in lexical"),
						saved !== null ? (0, h)("span", { className: "apxdsh-savedNotice" }, saved) : null,
						error !== null ? (0, h)("span", { className: "apxdsh-error" }, error) : null)));
		}
		//#endregion
		//#region lib/client/SearchSection.js
		/**
		* The soul of the panel: type a sentence, see exactly which tools the model
		* would be offered and with what scores. Every state — searching, empty,
		* failed — explains itself, because this screen teaches the mcp_search
		* experience by being it.
		*/
		function SearchSection() {
			const [query, setQuery] = (0, react.useState)("");
			const [phase, setPhase] = (0, react.useState)("idle");
			const [results, setResults] = (0, react.useState)([]);
			const [servedBy, setServedBy] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(void 0);
			const submit = async (event) => {
				event.preventDefault();
				const trimmed = query.trim();
				if (trimmed.length === 0) {
					setPhase("error");
					setError("先输入一句查询，再点 Search。");
					return;
				}
				setPhase("busy");
				setError(void 0);
				const answer = await bridgeRequest("/search", { method: "POST", body: { query: trimmed, limit: SEARCH_LIMIT } });
				if (!answer.ok || typeof answer.value !== "object" || answer.value === null || !Array.isArray(answer.value.results)) {
					setPhase("error");
					setError(answer.ok
						? "响应缺少 results 数组——宿主半的 aipx-hub 插件可能不是最新，更新后重试。"
						: `搜索失败：${answer.error}。确认 hub 在运行后重试。`);
					return;
				}
				setServedBy(typeof answer.value.engine === "string" ? answer.value.engine : null);
				setResults(answer.value.results.map((result) => ({
					id: stringOr(result?.id, ""),
					name: stringOr(result?.name, stringOr(result?.id, "(unnamed)")),
					server: stringOr(result?.server, ""),
					score: typeof result?.score === "number" ? result.score : null,
					description: stringOr(result?.description, "")
				})));
				setPhase("done");
			};
			return (0, h)("section", { className: "apxdsh-section", "aria-label": "Search playground" },
				(0, h)("div", { className: "apxdsh-sectionHead" },
					(0, h)("h3", { className: "apxdsh-sectionTitle" }, "Search playground"),
					servedBy !== null ? (0, h)("span", { className: "apxdsh-summaryMeta", title: "服务本次查询的检索引擎" }, `serving: ${servedBy}`) : null
				),
				(0, h)("p", { className: "apxdsh-intro" },
					"模拟模型视角：这句查询会原样发给 hub 的 mcp_search 索引，返回的卡片就是模型能「看见」的工具。"),
				(0, h)("form", { className: "apxdsh-searchForm", onSubmit: (event) => { void submit(event); }, noValidate: true },
					(0, h)("input", {
						className: "apxdsh-input",
						type: "search",
						value: query,
						placeholder: "试试：读取工作区里的文件",
						"aria-label": "Search query",
						onChange: (event) => { setQuery(event.target.value); }
					}),
					(0, h)("button", { type: "submit", className: "apxdsh-button", disabled: phase === "busy" },
						phase === "busy" ? "Searching…" : "Search")
				),
				(0, h)("div", { className: "apxdsh-results", role: "status", "aria-live": "polite" },
					phase === "idle" ? (0, h)("p", { className: "apxdsh-muted" }, "输入后按 Enter 或点 Search。") : null,
					phase === "busy" ? (0, h)("p", { className: "apxdsh-muted" }, "Searching…") : null,
					phase === "error" && error !== void 0 ? (0, h)("p", { className: "apxdsh-error", role: "alert" }, error) : null,
					phase === "done" && results.length === 0
						? (0, h)("p", { className: "apxdsh-empty" },
							"没有召回任何工具。模型看到的 mcp_search 也会得到同样的空结果——换更具体的说法，或确认相关服务器已注册。")
						: null,
					phase === "done" && results.length > 0
						? (0, h)(react.Fragment, null,
							(0, h)("p", { className: "apxdsh-muted" }, `${String(results.length)} results`),
							results.map((result, index) => (0, h)("div", { className: "apxdsh-result", key: result.id.length > 0 ? result.id : `result-${String(index)}` },
								(0, h)("div", { className: "apxdsh-resultHead" },
									(0, h)("span", { className: "apxdsh-resultName" }, result.name),
									result.server.length > 0 ? (0, h)("span", { className: "apxdsh-tag" }, result.server) : null,
									result.score !== null ? (0, h)("span", { className: "apxdsh-score", title: "相对排序分：只在同一次查询内比较大小，不同查询之间不可比" }, `score ${result.score.toFixed(3)}`) : null
								),
								result.description.length > 0
									? (0, h)("p", { className: "apxdsh-resultDesc" }, result.description)
									: null
							))
						)
						: null
				)
			);
		}
		//#endregion
		//#region lib/client/PluginSettings.js
		/**
		* 插件设置 —— 每个功能的开关 + 优化提示词的行为配置（模型/规则/范围/
		* 模板）。开关即时保存即时生效；文本类（自定义模型、规则、模板）用显式
		* 保存按钮。所有写入走 /aipx-hub/plugin-config PATCH。
		*/
		function SwitchRow({ label, hint, checked, disabled, onChange }) {
			return (0, h)("label", { className: "apxdsh-switchRow" },
				(0, h)("input", { type: "checkbox", className: "apxdsh-check", checked: checked, disabled: disabled, onChange: (e) => onChange(e.target.checked) }),
				(0, h)("span", { className: "apxdsh-switchText" },
					(0, h)("span", { className: "apxdsh-switchLabel" }, label),
					hint === null || hint === undefined ? null : (0, h)("span", { className: "apxdsh-switchHint" }, hint)
				)
			);
		}
		function PluginSettingsSection() {
			const config = usePluginConfig();
			const [busy, setBusy] = (0, react.useState)(false);
			const [saveError, setSaveError] = (0, react.useState)(null);
			const [savedNote, setSavedNote] = (0, react.useState)(null);
			const [customModel, setCustomModel] = (0, react.useState)(null);
			const [promptDraft, setPromptDraft] = (0, react.useState)(null);
			const [tplEditor, setTplEditor] = (0, react.useState)(null);
			const po = config.promptOptimize;
			const [catalog, setCatalog] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				let live = true;
				void loadModelCatalog().then((value) => {
					if (live) setCatalog(value);
				});
				return () => {
					live = false;
				};
			}, []);
			// 下拉 = 跟随 + 部署目录里的真实模型（与 composer 选择器同一份）+ 自定义。
			// 不手写任何模型名：目录随部署自动更新。历史存量值（如旧版的
			// deepseek-chat）不在目录里时按自定义展示，用户可原地改选。
			const catalogModels = catalog === null || !Array.isArray(catalog.groups) ? [] : catalog.groups.flatMap((group) => (group.models ?? []).map((model) => ({ id: String(model.id), name: String(model.name ?? model.id), provider: String(group.name ?? group.id ?? "") })));
			const modelIsPreset = po.model === "follow" || catalogModels.some((model) => model.id === po.model);
			const customActive = customModel !== null || !modelIsPreset;
			const promptValue = promptDraft ?? po.systemPrompt;
			const save = async (patch) => {
				setBusy(true);
				setSaveError(null);
				setSavedNote(null);
				try {
					await applyPluginConfig(patch);
					setSavedNote("已保存");
					setTimeout(() => setSavedNote(null), 2500);
				} catch (e) {
					setSaveError(e.message);
				} finally {
					setBusy(false);
				}
			};
			const saveModel = (value) => {
				const model = String(value ?? "").trim();
				if (model === "") return;
				setCustomModel(null);
				void save({ promptOptimize: { model } });
			};
			const savePrompt = () => {
				void save({ promptOptimize: { systemPrompt: promptDraft ?? po.systemPrompt } });
				setPromptDraft(null);
			};
			const restorePrompt = () => {
				void save({ promptOptimize: { systemPrompt: DEFAULT_SYSTEM_PROMPT } });
				setPromptDraft(null);
			};
			const saveTemplates = (templates) => void save({ promptOptimize: { templates } });
			const activateTemplate = (id) => saveTemplates(po.templates.map((t) => ({ ...t, active: t.id === id })));
			const deleteTemplate = (id) => saveTemplates(po.templates.filter((t) => t.id !== id));
			const submitTemplate = () => {
				if (tplEditor === null || tplEditor.name.trim() === "" || tplEditor.content.trim() === "") return;
				const templates = [...po.templates];
				if (typeof tplEditor.id === "string") {
					const i = templates.findIndex((t) => t.id === tplEditor.id);
					if (i !== -1) templates[i] = { ...templates[i], name: tplEditor.name.trim(), content: tplEditor.content };
				} else {
					templates.push({ id: `tpl-${String(Date.now())}`, name: tplEditor.name.trim(), content: tplEditor.content, active: false });
				}
				setTplEditor(null);
				saveTemplates(templates);
			};
			// The panel always renders (its own feature flag is the settings page);
			// only its sub-sections follow the feature switches.
			return (0, h)("section", { className: "apxdsh-section" },
				(0, h)("div", { className: "apxdsh-sectionHead" },
					(0, h)("h2", { className: "apxdsh-sectionTitle" }, "插件设置"),
					(0, h)("span", { className: "apxdsh-sectionMeta" }, "功能开关与优化提示词行为，存于 ~/.config/aipx/ai-plugin-toolkit.json"),
					savedNote === null ? null : (0, h)("span", { className: "apxdsh-savedNotice", role: "status" }, savedNote)
				),
				(0, h)("div", { className: "apxdsh-form" },
					(0, h)(SwitchRow, {
						label: "工具中枢",
						hint: "MCP 服务器 / 工具目录 / 模型工具,未来更多 aipx 工具",
						checked: config.features.mcpConsole.enabled === true,
						disabled: busy,
						onChange: (checked) => void save({ features: { mcpConsole: { enabled: checked } } })
					}),
					(0, h)(SwitchRow, {
						label: "优化提示词",
						hint: "composer 快捷按钮与 /prompt-optimize 命令",
						checked: config.features.promptOptimize.enabled === true,
						disabled: busy,
						onChange: (checked) => void save({ features: { promptOptimize: { enabled: checked } } })
					}),
					config.features.promptOptimize.enabled === false ? null : (0, h)("div", { className: "apxdsh-subOptions" },
						(0, h)(SwitchRow, {
							label: "按钮显示文字说明",
							hint: "默认关闭——按钮只显示 ✦ 图标，减少占位",
							checked: po.showLabel === true,
							disabled: busy,
							onChange: (checked) => void save({ promptOptimize: { showLabel: checked } })
						}),
						(0, h)("div", { className: "apxdsh-field" },
							(0, h)("span", { className: "apxdsh-label" }, "优化所用模型"),
							(0, h)("div", { className: "apxdsh-inlineRow" },
								(0, h)("select", { className: "apxdsh-select", value: customActive ? "custom" : po.model, disabled: busy, onChange: (e) => {
									const value = e.target.value;
									if (value === "custom") {
										setCustomModel(modelIsPreset ? "" : po.model);
										return;
									}
									saveModel(value);
								} },
									(0, h)("option", { value: "follow" }, "跟随输入框所选模型（推荐）"),
									catalogModels.map((model) => (0, h)("option", { key: model.id, value: model.id }, `${model.name}（${model.provider}）`)),
									(0, h)("option", { value: "custom" }, "自定义…")
								),
								customActive
									? (0, h)(react.Fragment, null,
										(0, h)("input", { className: "apxdsh-input", style: { maxWidth: "220px" }, placeholder: "模型名", value: customModel ?? po.model, onChange: (e) => setCustomModel(e.target.value) }),
										(0, h)("button", { className: "apxdsh-button apxdsh-smallButton", disabled: busy, onClick: () => saveModel(customModel ?? po.model) }, "保存")
									)
									: null
							),
							(0, h)("p", { className: "apxdsh-hint" }, "「跟随输入框所选模型」按输入框当前选中的模型发起优化；该模型不被 DeepSeek API 支持时自动回退部署默认模型，按钮提示会标注实际使用的模型。列表与输入框的模型选择器同源，随部署自动更新。API key 仍取 DEEPSEEK_API_KEY 环境变量或 ~/.dsh/.credentials.yaml。")
						),
						(0, h)("div", { className: "apxdsh-field" },
							(0, h)("span", { className: "apxdsh-label" }, "优化时结合的内容"),
							(0, h)("select", { className: "apxdsh-select", value: po.contextMode, disabled: busy, onChange: (e) => void save({ promptOptimize: { contextMode: e.target.value } }) },
								(0, h)("option", { value: "input" }, "仅输入框草稿（默认）"),
								(0, h)("option", { value: "session" }, "结合本次会话上下文")
							),
							(0, h)("p", { className: "apxdsh-hint" }, "「结合会话」会把当前会话最近几轮发给优化模型；取不到会话历史时自动退回仅输入框。")
						),
						(0, h)("div", { className: "apxdsh-field" },
							(0, h)("span", { className: "apxdsh-label" }, "优化规则（system prompt）"),
							(0, h)("textarea", { className: "apxdsh-textarea", value: promptValue, disabled: busy, onChange: (e) => setPromptDraft(e.target.value) }),
							(0, h)("p", { className: "apxdsh-hint" }, "含 {{input}} 时把用户输入原文代入该处；不含则作为 user 消息追加。"),
							(0, h)("div", { className: "apxdsh-formActions" },
								(0, h)("button", { className: "apxdsh-button apxdsh-smallButton", disabled: busy || promptDraft === null, onClick: savePrompt }, "保存规则"),
								(0, h)("button", { className: "apxdsh-ghostButton apxdsh-button apxdsh-smallButton", disabled: busy || promptValue === DEFAULT_SYSTEM_PROMPT || promptDraft !== null, onClick: restorePrompt }, "恢复默认")
							)
						),
						(0, h)("div", { className: "apxdsh-field" },
							(0, h)("span", { className: "apxdsh-label" }, "自定义模板"),
							po.templates.length === 0
								? (0, h)("p", { className: "apxdsh-muted" }, "还没有模板——规则区直接编辑即可，模板用于保存多套规则快速切换。")
								: (0, h)("div", { className: "apxdsh-tplList" },
									po.templates.map((t) =>
										(0, h)("div", { key: t.id, className: "apxdsh-tplRow" },
											t.active === true ? (0, h)("span", { className: "apxdsh-activeTag" }, "生效中") : null,
											(0, h)("span", { className: "apxdsh-tplName" }, t.name),
											(0, h)("span", { className: "apxdsh-tplPreview" }, t.content.replace(/\s+/g, " ").slice(0, 80)),
											(0, h)("div", { className: "apxdsh-tplActions" },
												(0, h)("button", { className: "apxdsh-button apxdsh-smallButton", disabled: busy || t.active === true, onClick: () => activateTemplate(t.id) }, "设为生效"),
												(0, h)("button", { className: "apxdsh-ghostButton apxdsh-button apxdsh-smallButton", disabled: busy, onClick: () => setTplEditor({ id: t.id, name: t.name, content: t.content }) }, "编辑"),
												(0, h)("button", { className: "apxdsh-dangerButton apxdsh-button apxdsh-smallButton", disabled: busy, onClick: () => deleteTemplate(t.id) }, "删除")
											)
										)
									)
								),
							tplEditor === null
								? (0, h)("div", { className: "apxdsh-formActions" },
									(0, h)("button", { className: "apxdsh-ghostButton apxdsh-button apxdsh-smallButton", disabled: busy, onClick: () => setTplEditor({ name: "", content: "" }) }, "新建模板")
								)
								: (0, h)("div", { className: "apxdsh-form" },
									(0, h)("div", { className: "apxdsh-formGrid" },
										(0, h)("div", { className: "apxdsh-field" },
											(0, h)("span", { className: "apxdsh-label" }, "模板名"),
											(0, h)("input", { className: "apxdsh-input", value: tplEditor.name, onChange: (e) => setTplEditor({ ...tplEditor, name: e.target.value }) })
										)
									),
									(0, h)("div", { className: "apxdsh-field" },
										(0, h)("span", { className: "apxdsh-label" }, "模板内容"),
										(0, h)("textarea", { className: "apxdsh-textarea", value: tplEditor.content, onChange: (e) => setTplEditor({ ...tplEditor, content: e.target.value }) })
									),
									(0, h)("div", { className: "apxdsh-formActions" },
										(0, h)("button", { className: "apxdsh-button apxdsh-smallButton", disabled: busy || tplEditor.name.trim() === "" || tplEditor.content.trim() === "", onClick: submitTemplate }, "保存模板"),
										(0, h)("button", { className: "apxdsh-ghostButton apxdsh-button apxdsh-smallButton", disabled: busy, onClick: () => setTplEditor(null) }, "取消")
									)
								)
						)
					)
				),
				saveError === null ? null : (0, h)("p", { className: "apxdsh-error", role: "alert" }, `保存失败：${saveError}`)
			);
		}
		//#endregion
		//#region lib/client/HubConsole.js
		/**
		* The tab panel. One refresh fans out to all three bridge reads in parallel;
		* latest request wins (a slow stale answer never overwrites a newer one).
		* When /status itself is unreachable the whole panel collapses to the
		* bridge-not-ready notice — the sections' own tolerant errors would only
		* repeat the same fact three times.
		*/
		function normalizeModelTools(value) {
			if (typeof value !== "object" || value === null || !Array.isArray(value.tools)) return null;
			return value.tools
				.map((tool) => ({
					id: stringOr(tool?.id, ""),
					name: stringOr(tool?.name, stringOr(tool?.id, "")),
					description: stringOr(tool?.description, "")
				}))
				.filter((tool) => tool.id.length > 0);
		}
		/** The 4 in-process hub meta-tools and the search-then-call loop they teach. */
		function ModelToolsSection({ data }) {
			const tools = data.modelTools;
			const body = tools === null
				? (0, h)("p", { className: "apxdsh-muted", role: "status" }, data.modelToolsError ?? "加载中…")
				: tools.length === 0
					? (0, h)("p", { className: "apxdsh-muted" }, "无")
					: tools.map((t) => {
						return (0, h)("div", { key: t.id, className: "apxdsh-result", style: { alignItems: "flex-start" } },
							(0, h)("div", { className: "apxdsh-resultHead" },
								(0, h)("code", { className: "apxdsh-toolId" }, t.name),
								(0, h)("span", { className: "apxdsh-tag" }, "hub")),
							(0, h)("p", { className: "apxdsh-resultDesc", style: { whiteSpace: "normal" } }, t.description));
					});
			return (0, h)("details", { className: "apxdsh-details" },
				(0, h)("summary", { className: "apxdsh-summary" },
					(0, h)("span", null, "模型工具"),
					tools !== null ? (0, h)("span", { className: "apxdsh-summaryMeta" }, `${tools.length} 个内置`) : null),
				(0, h)("div", { className: "apxdsh-detailsBody" }, body));
		}
		/** The free-text "Install MCP" box that replaces the multi-field form. */
		function InstallMcp({ existingNames, onAdded }) {
			const [value, setValue] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(void 0);
			const [notice, setNotice] = (0, react.useState)(void 0);
			const submit = async (e) => {
				e.preventDefault();
				const src = value.trim();
				if (src === "") { setError("先填入一个 MCP 命令、JSON 定义或安装链接。"); return; }
				setBusy(true); setError(void 0); setNotice(void 0);
				const answer = await bridgeRequest("/install", { method: "POST", body: { source: src } });
				setBusy(false);
				if (!answer.ok) { setError(`添加失败：${answer.error}`); return; }
				if (typeof answer.value === "object" && answer.value !== null && answer.value.ok === false) {
					setError(`添加失败：${stringOr(answer.value.error, "hub 拒绝了该定义")}`); return;
				}
				const names = answer.value?.installed ?? [];
				const over = (answer.value?.overwritten?.length) ? `（覆盖：${answer.value.overwritten.join("、")}）` : "";
				const skipped = (answer.value?.skipped?.length) ? ` — 跳过 ${answer.value.skipped.map((s) => s.name).join("、")}` : "";
				setValue(""); setNotice(`已添加：${names.join("、") || "(无)"}${over}${skipped}`);
				void onAdded();
			};
			return (0, h)("form", { className: "apxdsh-form", onSubmit: submit, noValidate: true },
				(0, h)("label", { className: "apxdsh-label" }, "安装 MCP(粘贴命令 / JSON 定义 / GitHub 链接 / npm 包名)"),
				(0, h)("textarea", {
					className: "apxdsh-textarea",
					value: value,
					disabled: busy,
					placeholder: "npx -y @modelcontextprotocol/server-filesystem /tmp\ngithub:owner/repo#path:/dir\n{\"mcpServers\":{\"fs\":{\"command\":\"npx -y @modelcontextprotocol/server-filesystem\"}}}\n@modelcontextprotocol/server-memory",
					onChange: (e) => { setValue(e.target.value); setError(void 0); setNotice(void 0); }
				}),
				error !== void 0 && error !== null ? (0, h)("p", { className: "apxdsh-error", role: "alert" }, error) : null,
				notice !== void 0 && notice !== null ? (0, h)("p", { className: "apxdsh-savedNotice", role: "status" }, notice) : null,
				(0, h)("div", { className: "apxdsh-formActions" },
					(0, h)("button", { type: "submit", className: "apxdsh-button", disabled: busy }, busy ? "安装中…" : "安装"),
					(0, h)("span", { className: "apxdsh-hint" }, "需要 env/headers 的服务器可在终端用 aipx mcp add 配置。"))
			);
		}

		function HubConsole() {
			const pluginConfig = usePluginConfig();
			const [data, setData] = (0, react.useState)(() => ({
				loaded: false,
				statusError: null,
				status: null,
				toolsError: null,
				tools: null,
				configError: null,
				config: null,
				modelToolsError: null,
				modelTools: null
			}));
			const [refreshing, setRefreshing] = (0, react.useState)(false);
			const requestRef = (0, react.useRef)(0);
			const refresh = (0, react.useCallback)(async () => {
				const requestId = requestRef.current + 1;
				requestRef.current = requestId;
				setRefreshing(true);
				const [statusAnswer, toolsAnswer, configAnswer, modelToolsAnswer] = await Promise.all([
					bridgeRequest("/status"),
					bridgeRequest("/tools"),
					bridgeRequest("/config"),
					bridgeRequest("/model-tools")
				]);
				if (requestRef.current !== requestId) return;
				const status = statusAnswer.ok ? normalizeStatus(statusAnswer.value) : null;
				const tools = toolsAnswer.ok ? normalizeTools(toolsAnswer.value) : null;
				const config = configAnswer.ok ? normalizeConfig(configAnswer.value) : null;
				const modelTools = modelToolsAnswer.ok ? normalizeModelTools(modelToolsAnswer.value) : null;
				setData({
					loaded: true,
					status: status,
					statusError: status === null ? (statusAnswer.ok ? "status 响应格式不符合预期" : statusAnswer.error) : null,
					tools: tools,
					toolsError: tools === null ? (toolsAnswer.ok ? "响应里没有 tools 数组——宿主半可能尚未就绪" : toolsAnswer.error) : null,
					config: config,
					configError: config === null ? (configAnswer.ok ? "config 响应格式不符合预期" : configAnswer.error) : null,
					modelTools: modelTools,
					modelToolsError: modelTools === null ? (modelToolsAnswer.ok ? "模型工具响应格式不符合预期" : modelToolsAnswer.error) : null
				});
				setRefreshing(false);
			}, []);
			(0, react.useEffect)(() => {
				void refresh();
			}, [refresh]);
			const bridgeReady = data.loaded && data.statusError === null;
			const consoleEnabled = pluginConfig.features.mcpConsole.enabled !== false;
			return (0, h)("div", { className: "apxdsh-root" },
				(0, h)(StatusRow, { data: data, refreshing: refreshing, onRefresh: () => { void refresh(); } }),
				(0, h)(PluginSettingsSection, null),
				!data.loaded ? (0, h)("p", { className: "apxdsh-muted", role: "status" }, "Checking the hub bridge…") : null,
				data.loaded && data.statusError !== null
					? (0, h)("div", { className: "apxdsh-notice", role: "status" },
						(0, h)("span", { className: "apxdsh-noticeTitle" }, "Hub 桥未就绪"),
						(0, h)("span", null,
							"面板无法读取 ",
							(0, h)("code", { className: "apxdsh-code" }, "/aipx-hub/status"),
							`（${data.statusError}）。确认 dsh 已安装并重启加载了 ai-plugin-toolkit 插件（Plugin list 里应能看到它），然后点右上角 Refresh 重试。`)
					)
					: null,
				consoleEnabled && bridgeReady
					? (0, h)("div", { className: "apxdsh-grid" },
						(0, h)(ServersSection, { data: data, onRefresh: refresh }),
						(0, h)(EngineSection, { data: data, onRefresh: refresh }),
						(0, h)(ModelToolsSection, { data: data }),
						(0, h)(ToolsSection, { data: data, onRefresh: refresh }),
						(0, h)(SearchSection, null)
					)
					: null
			);
		}
		//#endregion
		//#region lib/client/plugin-config.js
		/**
		* Module-level plugin config store. One shared cache + subscriber set: the
		* settings panel, the optimize dock, the hero dock and the HubConsole all
		* read the same snapshot, and a save from the panel repaints every surface
		* (feature toggles, label visibility) without a page reload. The bridge
		* remains the only source of truth — the cache is a mirror of the last
		* successful GET/POST of /aipx-hub/plugin-config.
		*/
		const DEFAULT_SYSTEM_PROMPT = "你是提示词优化助手。把用户的原始输入改写成清晰、具体、结构化的高质量提示词：明确目标与预期产出物，补全必要上下文与约束（不确定处以「假设：…」标注），按 目标/背景/要求/产出格式 分节。只输出改写后的提示词，不要执行它。";
		const DEFAULT_PLUGIN_CONFIG = {
			features: {
				mcpConsole: { enabled: true, fullscreen: true },
				promptOptimize: { enabled: true }
			},
			promptOptimize: {
				showLabel: false,
				model: "follow",
				contextMode: "input",
				systemPrompt: DEFAULT_SYSTEM_PROMPT,
				templates: []
			}
		};
		function normalizePluginConfigClient(value) {
			const out = JSON.parse(JSON.stringify(DEFAULT_PLUGIN_CONFIG));
			if (typeof value !== "object" || value === null) return out;
			const features = value.features;
			if (typeof features === "object" && features !== null) {
				for (const id of ["mcpConsole", "promptOptimize"]) {
					const f = features[id];
					if (typeof f === "object" && f !== null && typeof f.enabled === "boolean") out.features[id].enabled = f.enabled;
				}
				if (features.mcpConsole !== null && typeof features.mcpConsole === "object"
					&& typeof features.mcpConsole.fullscreen === "boolean") {
					out.features.mcpConsole.fullscreen = features.mcpConsole.fullscreen;
				}
			}
			const po = value.promptOptimize;
			if (typeof po === "object" && po !== null) {
				if (typeof po.showLabel === "boolean") out.promptOptimize.showLabel = po.showLabel;
				if (typeof po.model === "string" && po.model.trim() !== "") out.promptOptimize.model = po.model.trim().slice(0, 128);
				if (po.contextMode === "input" || po.contextMode === "session") out.promptOptimize.contextMode = po.contextMode;
				if (typeof po.systemPrompt === "string") out.promptOptimize.systemPrompt = po.systemPrompt;
				if (Array.isArray(po.templates)) {
					const templates = [];
					for (const t of po.templates) {
						if (typeof t !== "object" || t === null) continue;
						if (typeof t.id !== "string" || t.id === "" || typeof t.name !== "string" || typeof t.content !== "string") continue;
						templates.push({ id: t.id, name: t.name, content: t.content, active: t.active === true });
					}
					out.promptOptimize.templates = templates;
				}
			}
			return out;
		}
		const pluginConfigState = {
			config: null,
			promise: null,
			listeners: new Set()
		};
		function getPluginConfigSnapshot() {
			return pluginConfigState.config ?? DEFAULT_PLUGIN_CONFIG;
		}
		function notifyPluginConfig() {
			for (const fn of pluginConfigState.listeners) {
				try {
					fn();
				} catch {}
			}
		}
		/** Load once, shared by every consumer; failed loads reset so later mounts retry. */
		function ensurePluginConfig() {
			if (pluginConfigState.promise !== null) return pluginConfigState.promise;
			pluginConfigState.promise = bridgeRequest("/plugin-config").then((answer) => {
				pluginConfigState.config = answer.ok ? normalizePluginConfigClient(answer.value) : null;
				notifyPluginConfig();
				return getPluginConfigSnapshot();
			}).finally(() => {
				pluginConfigState.promise = null;
			});
			return pluginConfigState.promise;
		}
		/** Persist a PATCH; the response is the normalized stored config. Throws with the bridge error text. */
		function applyPluginConfig(patch) {
			return bridgeRequest("/plugin-config", { method: "POST", body: patch }).then((answer) => {
				if (!answer.ok) throw new Error(answer.error);
				pluginConfigState.config = normalizePluginConfigClient(answer.value);
				notifyPluginConfig();
				return pluginConfigState.config;
			});
		}
		function subscribePluginConfig(fn) {
			pluginConfigState.listeners.add(fn);
			return () => {
				pluginConfigState.listeners.delete(fn);
			};
		}
		/** React hook: subscribe to the store; returns the snapshot (defaults while loading). */
		function usePluginConfig() {
			const [config, setConfig] = (0, react.useState)(getPluginConfigSnapshot);
			(0, react.useEffect)(() => {
				let live = true;
				void ensurePluginConfig().then(() => {
					if (live) setConfig(getPluginConfigSnapshot());
				});
				const unsubscribe = subscribePluginConfig(() => setConfig(getPluginConfigSnapshot()));
				return () => {
					live = false;
					unsubscribe();
				};
			}, []);
			return config;
		}
		//#endregion
		//#region lib/client/composer-dom.js
		/**
		* Shared composer DOM access for both prompt-optimize surfaces (the session
		* dock and the hero fallback). The page carries several textarea/
		* contenteditable candidates (responsive duplicate panels, hero variant);
		* only the visible one in the lower viewport is where the user types.
		*/
		const findComposerEl = () => {
			const candidates = [...document.querySelectorAll('textarea, [contenteditable="true"]')]
				.filter((el) => {
					const r = el.getBoundingClientRect();
					if (r.width < 80 || r.height < 24) return false;
					const style = getComputedStyle(el);
					return !(style.visibility === "hidden" || style.display === "none");
				});
			// 活跃 composer 是「底边最低」的可见输入框：正常视图贴底，hero 变体居中
			// 但仍低于搜索框等顶部输入。个别布局（如损坏会话）会把 composer 顶到
			// 页面上部——按底边排序仍能选中它，硬性要求下半屏反而会找不到。
			const visible = candidates.filter((el) => el.offsetParent !== null);
			const pool = visible.length > 0 ? visible : candidates;
			return pool.slice().sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] ?? null;
		};
		/** 校验只比「有效字符」：换行在 Lexical model 里是段落节点，textContent
		* 拼接时没有空白；markdown 快捷变换又会吃掉 #、* 等标记换成格式。去掉
		* 空白与标记符后比较——要抓的是「没写进去/被弹回」，不是格式差异。 */
		const COMPOSER_SIGNIFICANT = /[\u200b\u200c\u200d\ufeff\s#"*_~]/g;
		const significant = (text) => text.replace(COMPOSER_SIGNIFICANT, "");
		const composerText = (composer) => significant(composer.textContent ?? "");
		const writeComposerEl = async (composer, text) => {
			if (composer.tagName === "TEXTAREA" || composer.tagName === "INPUT") {
				const proto = Object.getPrototypeOf(composer);
				Object.getOwnPropertyDescriptor(proto, "value").set.call(composer, text);
				composer.dispatchEvent(new Event("input", { bubbles: true }));
				return;
			}
			const expect = significant(text);
			// 输入框由 Lexical 代理：DOM 后门（execCommand/直写）都会被它的
			// reconcile 弹回旧 model，点击按钮造成的失焦更会清掉选区。唯一稳的
			// 路是 Lexical 公开 API——editor state JSON 改写后 setEditorState。
			// 非 Lexical 的 contenteditable 仍走编辑管线兜底；逐策略写完即校验，
			// 全失败就抛错，宁可报“优化失败”也不谎报成功。
			const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
			const focusEditor = async () => {
				composer.focus();
				await new Promise((resolve) => setTimeout(resolve, 32));
			};
			const selectAll = () => {
				const sel = window.getSelection();
				const range = document.createRange();
				range.selectNodeContents(composer);
				sel.removeAllRanges();
				sel.addRange(range);
			};
			const strategies = [
				// 首选：Lexical model 级替换。按行拆成段落节点，和用户手敲多行的
				// 结构一致；parse/set 都是 Lexical 公开 API。
				async () => {
					const editor = composer.__lexicalEditor;
					if (!editor || typeof editor.parseEditorState !== "function" || typeof editor.setEditorState !== "function") return;
					const json = editor.getEditorState().toJSON();
					json.root.children = text.split("\n").map((line) => ({
						type: "paragraph", version: 1, format: "", indent: 0, direction: null,
						children: [{ type: "text", text: line, version: 1, detail: 0, format: 0, mode: "normal", style: "" }]
					}));
					editor.setEditorState(editor.parseEditorState(json));
					await settle(120);
				},
				async () => {
					await focusEditor();
					selectAll();
					document.execCommand("insertText", false, text);
				},
				async () => {
					await focusEditor();
					document.execCommand("selectAll", false, null);
					document.execCommand("insertText", false, text);
				},
				// 最后的兜底：直写 DOM + 事件对。model 可能不认账（下一拍被回滚），
				// 校验放在一拍之后——被回滚就当失败处理。
				async () => {
					await focusEditor();
					composer.textContent = text;
					composer.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: text }));
					composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
					await new Promise((resolve) => setTimeout(resolve, 32));
				}
			];
			for (const run of strategies) {
				try {
					await run();
				} catch {}
				if (composerText(composer) === expect) return;
			}
			throw new Error("改写结果写不进输入框（编辑器拒绝了外部替换）");
		};
		//#region lib/client/model-catalog.js
		/**
		* The host's model catalog — the same provider/model view the composer
		* model selector shows, served by the bridge's /aipx-hub/model-catalog
		* (host-side ctx.llm; the client-side `remote` face is not granted to
		* external plugins). Shared: the settings dropdown renders dynamic
		* options from it; the optimize docks use it to map the composer-selected
		* model's display name to its exact id when promptOptimize.model is
		* "follow".
		*/
		let catalogPromise = null;
		function loadModelCatalog() {
			if (catalogPromise === null) {
				catalogPromise = bridgeRequest("/model-catalog").then((answer) => {
					const value = answer.ok && typeof answer.value === "object" && answer.value !== null ? answer.value : null;
					return Array.isArray(value.groups) && value.groups.length > 0 ? value : null;
				}).catch(() => null);
			}
			return catalogPromise;
		}
		/** 目录里精确映射：显示名 → 模型 id。映射不到时退回小写试探（宿主对
		* API 不认的模型自动回退 deepseek-chat 并回传实际使用的模型）。 */
		async function resolveFollowModel() {
			const button = [...document.querySelectorAll("button[aria-label]")]
				.find((b) => (b.getAttribute("aria-label") ?? "").startsWith("选择模型，当前"));
			if (!button) return null;
			const m = /选择模型，当前 (.+?)(?:，推理等级|$)/.exec(button.getAttribute("aria-label") ?? "");
			if (m === null) return null;
			const name = m[1].trim();
			const catalog = await loadModelCatalog();
			if (catalog !== null) {
				for (const group of catalog.groups) {
					for (const model of group.models ?? []) {
						if (model.name === name && typeof model.id === "string" && model.id !== "") return model.id;
					}
				}
			}
			const guess = name.toLowerCase().replace(/\s+/g, "-");
			return /^[\w.:-]+$/.test(guess) ? guess : null;
		}
		//#endregion
		/** One /aipx-hub/optimize round trip; throws with the bridge's error text.
		* Returns { text, model } — the model that actually served the request. */
		const requestOptimize = async (text, sessionId, model) => {
			const payload = { text };
			if (sessionId !== undefined) payload.sessionId = sessionId;
			if (model !== undefined && model !== null) payload.model = model;
			const r = await fetch("/aipx-hub/optimize", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload)
			});
			const data = await r.json().catch(() => ({}));
			if (!r.ok || !data.text) throw new Error(data.error || `HTTP ${r.status}`);
			return { text: data.text, model: typeof data.model === "string" ? data.model : null };
		};
		//#endregion
		//#region lib/client/PromptOptimizeDock.js
		/**
		* ✦ 优化提示词 —— 会话内 composer 卡片正下方的 dock 条目。点击后读取
		* 输入框草稿，经 /aipx-hub/optimize（DeepSeek 改写）替换回输入框。
		*
		* Behavior is config-driven: the whole feature can be switched off
		* (renders null), the label defaults to icon-only (`showLabel`), and the
		* busy state shows a spinner + 「生成中…」 instead of the old "✦ …".
		* `sessionId` arrives from the slot system's session scope (undefined on
		* the hero variant), and is forwarded for contextMode "session".
		*/
		function PromptOptimizeDock({ sessionId }) {
			const config = usePluginConfig();
			const [phase, setPhase] = (0, react.useState)("idle");
			const [note, setNote] = (0, react.useState)(null);
			const optimize = async () => {
				const composer = findComposerEl();
				const draft = composer ? (composer.value ?? composer.textContent ?? "").trim() : "";
				if (draft.length === 0) {
					setPhase("error");
					setNote(composer ? "输入框是空的——先写下你的想法，再点优化。" : "未找到输入框——先回到聊天视图再试。");
					return;
				}
				setPhase("busy");
				setNote("生成中…");
				try {
					const followModel = config.promptOptimize.model === "follow" ? await resolveFollowModel() : null;
					const result = await requestOptimize(draft, sessionId, followModel);
					await writeComposerEl(composer, result.text);
					setPhase("done");
					setNote(result.model !== null ? `已用 ${result.model} 优化并替换输入框内容。` : "已用优化后的提示词替换输入框内容。");
					setTimeout(() => setNote(null), 4000);
				} catch (e) {
					setPhase("error");
					setNote(`优化失败：${e.message}`);
					setTimeout(() => setNote(null), 6000);
				}
			};
			if (config.features.promptOptimize.enabled !== true) return null;
			const showLabel = config.promptOptimize.showLabel === true;
			return (0, h)("div", { className: "apxdsh-dock", role: "status" },
				(0, h)("button", {
					className: "apxdsh-dockButton" + (phase === "busy" ? " apxdsh-dockBusy" : "") + (phase === "error" ? " apxdsh-dockError" : ""),
					onClick: () => { void optimize(); },
					disabled: phase === "busy",
					title: note ?? "优化输入框中的提示词",
					"aria-label": "优化输入框中的提示词"
				},
					phase === "busy"
						? [ (0, h)("span", { key: "sp", className: "apxdsh-spin" }), " ", "生成中…" ]
						: showLabel
							? [ (0, h)("span", { key: "g", className: "apxdsh-dockGlyph" }, "✦"), " ", "优化提示词" ]
							: (0, h)("span", { className: "apxdsh-dockGlyph" }, "✦")
				)
			);
		}
		//#endregion
		//#region lib/client/hero-dock.js
		/**
		* Hero fallback mount. The `conversation.composer.dock` projector gates on
		* `sessionId !== undefined`, so on the new-session hero — where prompt
		* optimization matters most, before the first message exists — no slot can
		* render yet. Until dsh ships a hero-composer slot, place the same button
		* from outside React's tree: fixed-position, anchored to the hero toolbar's
		* 访问模式 chip, standing down whenever the session dock is present.
		*/
		function mountHeroDock() {
			if (typeof document === "undefined") return;
			const mount = () => {
				if (document.querySelector(".apxdsh-heroDock") !== null) return;
				const host = document.createElement("div");
				host.className = "apxdsh-heroDock";
				host.style.cssText = "position:fixed;z-index:6;pointer-events:none;display:none";
				const button = document.createElement("button");
				button.type = "button";
				button.className = "apxdsh-dockButton";
				button.title = "优化输入框中的提示词";
				button.style.pointerEvents = "auto";
				host.appendChild(button);
				document.body.appendChild(host);
				// Config-driven presentation: the feature flag hides the button, and
				// the label defaults to icon-only per `showLabel`.
				let configEnabled = getPluginConfigSnapshot().features.promptOptimize.enabled === true;
				let configShowLabel = getPluginConfigSnapshot().promptOptimize.showLabel === true;
				const refreshLabel = () => {
					button.textContent = configShowLabel ? "✦ 优化提示词" : "✦";
				};
				refreshLabel();
				let noteTimer = 0;
				const flash = (title, ms) => {
					button.title = title;
					clearTimeout(noteTimer);
					noteTimer = setTimeout(() => {
						button.title = "优化输入框中的提示词";
						refreshLabel();
					}, ms);
				};
				const unsubscribe = subscribePluginConfig(() => {
					const next = getPluginConfigSnapshot();
					configEnabled = next.features.promptOptimize.enabled === true;
					configShowLabel = next.promptOptimize.showLabel === true;
					refreshLabel();
					schedule();
				});
				button.addEventListener("click", async () => {
					if (button.disabled) return;
					const composer = findComposerEl();
					const draft = composer ? (composer.value ?? composer.textContent ?? "").trim() : "";
					if (draft.length === 0) {
						flash(composer ? "输入框是空的——先写下你的想法，再点优化。" : "未找到输入框——先回到聊天视图再试。", 4000);
						return;
					}
					button.disabled = true;
					button.textContent = "✦ 生成中…";
					try {
						const followModel = getPluginConfigSnapshot().promptOptimize.model === "follow" ? await resolveFollowModel() : null;
						const result = await requestOptimize(draft, undefined, followModel);
						await writeComposerEl(composer, result.text);
						button.textContent = "✦ 已替换";
						flash(result.model !== null ? `已用 ${result.model} 优化并替换输入框内容。` : "已用优化后的提示词替换输入框内容。", 4000);
					} catch (e) {
						flash(`优化失败：${e.message}`, 6000);
					} finally {
						button.disabled = false;
					}
				});
				// 访问模式 chip 是 hero 工具条上最稳的锚点；找不到就退到输入卡片左下角。
				// 会话视图由官方 dock 槽位负责——浮层在 .apxdsh-dock 出现时收场。
				const position = () => {
					if (!configEnabled) {
						host.style.display = "none";
						return;
					}
					const composer = findComposerEl();
					if (composer === null || document.querySelector(".apxdsh-dock") !== null) {
						host.style.display = "none";
						return;
					}
					const cardR = composer.getBoundingClientRect();
					let chipR = null;
					for (const b of document.querySelectorAll("button")) {
						if (!(b.textContent ?? "").includes("工作区内修改")) continue;
						const r = b.getBoundingClientRect();
						if (r.width === 0) continue;
						if (r.top < cardR.top - 40 || r.top > cardR.bottom + 120) continue;
						chipR = r;
						break;
					}
					const x = chipR === null ? cardR.left : chipR.right + 8;
					const y = chipR === null ? cardR.bottom + 6 : chipR.top + (chipR.height - 26) / 2;
					host.style.display = "block";
					host.style.left = `${String(Math.round(x))}px`;
					host.style.top = `${String(Math.round(y))}px`;
				};
				// 合并用 setTimeout 而不是 rAF：后台/隐藏标签页里 rAF 回调会被
				// 浏览器无限搁置，浮层会永远停在初始隐藏态（实测踩过）。
				// setTimeout 后台仍会触发（最低约 1s 一拍）。
				let scheduled = 0;
				const schedule = () => {
					if (scheduled !== 0) return;
					scheduled = window.setTimeout(() => {
						scheduled = 0;
						position();
					}, 32);
				};
				new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
				window.addEventListener("resize", schedule);
				window.addEventListener("scroll", schedule, true);
				// 后台/隐藏标签页里 rAF 永不回调（浏览器节流），浮层会永远停在
				// 初始隐藏态——低频 setInterval 兜底保证恢复可见后能追上。
				const interval = setInterval(schedule, 1000);
				window.addEventListener("pagehide", () => clearInterval(interval), { once: true });
				void ensurePluginConfig().then(() => {
					configEnabled = getPluginConfigSnapshot().features.promptOptimize.enabled === true;
					configShowLabel = getPluginConfigSnapshot().promptOptimize.showLabel === true;
					refreshLabel();
					schedule();
				});
				position();
			};
			if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
			else mount();
		}
		//#endregion
		//#region lib/client/index.js
		/**
		* The only client service this module touches is the slot ledger; everything
		* else talks to the bridge over same-origin fetch.
		*/
		const inject = [
			"slots"
		];
		/**
		* Occupy one Plugins-settings tab. Registration follows the runtime slot
		* directory's own example for `settings.plugins.tab` (dsh-cordis-client-runner):
		* a fresh `id` adds a tab beside the shipped entries (`all`, `configurable`)
		* without replacing either; `order` 50 slots it between them; the shell
		* projects `label` as the tab text.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			// "工具中枢" as a top-level LEFT-SIDEBAR settings page (settings.section),
			// per the shell's nav projection — not a tab inside Plugins.
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "aipx-hub-console",
				order: 20,
				label: "工具中枢",
				inject: () => ({})
			}, HubConsole));
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "aipx-prompt-optimize",
				order: 0,
				// Session scope: the inject factory receives the current session id,
				// which contextMode "session" forwards to /aipx-hub/optimize.
				inject: (sessionId) => ({ sessionId })
			}, PromptOptimizeDock));
			// 官方 dock 槽位只在已打开的会话里投影；hero 首页由这个浮层补位
			mountHeroDock();
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
