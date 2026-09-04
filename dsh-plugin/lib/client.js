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
		const css = ".apxdsh-root{display:flex;flex-direction:column;gap:24px;width:100%;max-width:720px;min-width:0;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}.apxdsh-muted{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0}.apxdsh-code{font-family:var(--ds-font-family-code);font-size:.92em;background:var(--dsw-alias-bg-layer-1);border-radius:4px;padding:1px 5px}.apxdsh-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;margin:0}.apxdsh-savedNotice{color:var(--dsw-alias-state-success-primary);font-size:12px;line-height:18px;margin:0}.apxdsh-statusRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.apxdsh-statusLabel{font-weight:500}.apxdsh-statusMeta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.apxdsh-refresh{margin-left:auto}.apxdsh-dot{box-sizing:border-box;border-radius:50%;width:8px;height:8px;flex:none;display:inline-block}.apxdsh-dotRunning{background:var(--dsw-alias-state-success-primary);animation:apxdsh-breathe 2.6s ease-in-out infinite}.apxdsh-dotStopped{background:var(--dsw-alias-state-error-primary)}.apxdsh-dotWarn{background:var(--dsw-alias-state-warn-label)}.apxdsh-dotIdle{background:var(--dsw-alias-border-l3)}.apxdsh-dotOk{background:var(--dsw-alias-state-success-primary)}@keyframes apxdsh-breathe{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.82)}}.apxdsh-section{display:flex;flex-direction:column;gap:10px;min-width:0}.apxdsh-sectionHead{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.apxdsh-sectionTitle{margin:0;font-size:14px;font-weight:500;line-height:22px}.apxdsh-sectionMeta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.apxdsh-intro{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:0}.apxdsh-notice{display:flex;flex-direction:column;gap:4px;border:.5px solid var(--dsw-alias-border-l4);border-radius:10px;padding:12px 14px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.apxdsh-noticeTitle{color:var(--dsw-alias-state-warn-label);font-weight:500}.apxdsh-empty{border:1px dashed var(--dsw-alias-border-l3);border-radius:10px;padding:12px 14px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px;margin:0}.apxdsh-tableScroll{overflow-x:auto;min-width:0}.apxdsh-table{width:100%;border-collapse:collapse;font-size:13px}.apxdsh-table th{text-align:left;padding:6px 10px;border-bottom:.5px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:500;line-height:16px;white-space:nowrap}.apxdsh-table td{padding:9px 10px;border-bottom:.5px solid var(--dsw-alias-border-l4);vertical-align:top}.apxdsh-table tbody tr:last-child td{border-bottom:none}.apxdsh-serverName{font-weight:500;white-space:nowrap}.apxdsh-serverCommand{font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.apxdsh-serverError{color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:16px;margin-top:2px;white-space:normal}.apxdsh-statusCell{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary)}.apxdsh-toolCount{font-family:var(--ds-font-family-code);font-size:12px}.apxdsh-actionCell{text-align:right;white-space:nowrap}.apxdsh-details{border:.5px solid var(--dsw-alias-border-l4);border-radius:12px;min-width:0}.apxdsh-summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;padding:10px 14px;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);border-radius:12px}.apxdsh-summary::-webkit-details-marker{display:none}.apxdsh-summary::before{content:\"\";width:5px;height:5px;flex:none;border-bottom:1.5px solid currentColor;border-right:1.5px solid currentColor;transform:rotate(-45deg) translate(-1px,-1px);transition:transform 120ms ease}.apxdsh-details[open]>.apxdsh-summary::before{transform:rotate(45deg) translate(-1px,-1px)}.apxdsh-summary:hover{background:var(--dsw-alias-interactive-bg-hover)}.apxdsh-summaryMeta{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400}.apxdsh-detailsBody{display:flex;flex-direction:column;gap:10px;padding:2px 14px 14px;min-width:0}.apxdsh-form{display:flex;flex-direction:column;gap:10px;min-width:0}.apxdsh-formGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.apxdsh-field{display:flex;flex-direction:column;gap:4px;min-width:0}.apxdsh-label{color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px}.apxdsh-formActions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.apxdsh-hint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}.apxdsh-input{box-sizing:border-box;width:100%;height:32px;padding:0 10px;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l4);border-radius:8px}.apxdsh-input:focus{border-color:var(--dsw-alias-brand-primary);outline:none}.apxdsh-input::placeholder{color:var(--dsw-alias-label-dimmed)}.apxdsh-button{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:4px;height:32px;padding:0 14px;border:none;border-radius:16px;font:inherit;font-size:13px;line-height:18px;cursor:pointer;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}.apxdsh-button:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}.apxdsh-button:disabled{opacity:.4;cursor:default}.apxdsh-ghostButton{background:transparent;color:var(--dsw-alias-label-primary);border:.5px solid var(--dsw-alias-border-l3)}.apxdsh-ghostButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.apxdsh-dangerButton{background:transparent;color:var(--dsw-alias-state-error-primary);border:.5px solid var(--dsw-alias-border-l3)}.apxdsh-dangerButton:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}.apxdsh-smallButton{height:26px;padding:0 10px;font-size:12px;border-radius:13px}.apxdsh-button:focus-visible,.apxdsh-summary:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.apxdsh-toolList{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;max-height:320px;overflow-y:auto}.apxdsh-toolItem{display:flex;align-items:baseline;gap:10px;padding:5px 8px;border-radius:6px;min-width:0}.apxdsh-toolItem:hover{background:var(--dsw-alias-interactive-bg-hover)}.apxdsh-toolId{font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.apxdsh-toolDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.apxdsh-searchForm{display:flex;gap:8px;min-width:0}.apxdsh-searchForm .apxdsh-input{flex:1 1 auto;min-width:0}.apxdsh-searchForm .apxdsh-button{flex:none}.apxdsh-results{display:flex;flex-direction:column;gap:8px;min-width:0}.apxdsh-result{display:flex;flex-direction:column;gap:4px;border:.5px solid var(--dsw-alias-border-l4);border-radius:10px;padding:10px 12px;min-width:0}.apxdsh-resultHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0}.apxdsh-resultName{font-weight:500;font-size:13px}.apxdsh-tag{border:.5px solid var(--dsw-alias-border-l3);border-radius:4px;padding:1px 6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code)}.apxdsh-score{margin-left:auto;font-family:var(--ds-font-family-code);font-size:11px;color:var(--dsw-alias-label-tertiary)}.apxdsh-resultDesc{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}@media (max-width:480px){.apxdsh-serverCommand{max-width:160px}}@media (prefers-reduced-motion:reduce){.apxdsh-dotRunning{animation:none}.apxdsh-summary::before{transition:none}}.apxdsh-toolToggle{flex:none;display:inline-flex;align-items:center;gap:6px;cursor:pointer}.apxdsh-toolItemDisabled .apxdsh-toolId,.apxdsh-toolItemDisabled .apxdsh-toolDesc{opacity:.45;text-decoration:line-through}.apxdsh-engineRow{display:flex;gap:8px;min-width:0}.apxdsh-engineRow .apxdsh-input{flex:1 1 auto}";
		const tagId = "ai-plugin-toolkit-dsh/HubConsole.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "ai-plugin-toolkit-dsh";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region lib/client/bridge.js
		/**
		* The host-half bridge lives on the dsh webserver's own origin, so plain
		* same-origin fetch is enough — no client remote namespaces involved.
		*/
		const BRIDGE_BASE = "/aipx-hub";
		/** One shot, not a conversation: a stalled bridge answers or gets abandoned. */
		const REQUEST_TIMEOUT_MS = 8000;
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
			const [transport, setTransport] = (0, react.useState)("command");
			const [command, setCommand] = (0, react.useState)("");
			const [args, setArgs] = (0, react.useState)("");
			const [url, setUrl] = (0, react.useState)("");
			const [env, setEnv] = (0, react.useState)("");
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
				const byUrl = transport === "url";
				if (byUrl && !/^https?:\/\//.test(url.trim())) {
					setError("URL 必填且以 http:// 或 https:// 开头（streamable-HTTP 传输）。");
					return;
				}
				if (!byUrl && command.trim().length === 0) {
					setError("Command 必填，例如 npx -y @some/mcp-server。");
					return;
				}
				const parsedArgs = args.split(",").map((part) => part.trim()).filter((part) => part.length > 0);
				const parsedEnv = parseEnv(env);
				const def = byUrl
					? { url: url.trim() }
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
				if (detailsRef.current !== null) detailsRef.current.open = false;
				props.onAdded(trimmedName);
			};
			return (0, h)("details", { className: "apxdsh-details", ref: detailsRef },
				(0, h)("summary", { className: "apxdsh-summary" }, "Add server"),
				(0, h)("div", { className: "apxdsh-detailsBody" },
					(0, h)("form", { className: "apxdsh-form", onSubmit: (event) => { void submit(event); }, noValidate: true },
						(0, h)("div", { className: "apxdsh-formGrid" },
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
									onChange: (event) => { setName(event.target.value); }
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
								(0, h)("span", { className: "apxdsh-label" }, "Env"),
								(0, h)("input", {
									className: "apxdsh-input",
									type: "text",
									value: env,
									placeholder: "KEY=VALUE, KEY2=VALUE2",
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
				(0, h)(AddServerForm, {
					onAdded: (name) => {
						setNotice(`已添加 ${name}。`);
						void onRefresh();
					}
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
					(0, h)("h3", { className: "apxdsh-sectionTitle" }, "Search playground")
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
		//#region lib/client/HubConsole.js
		/**
		* The tab panel. One refresh fans out to all three bridge reads in parallel;
		* latest request wins (a slow stale answer never overwrites a newer one).
		* When /status itself is unreachable the whole panel collapses to the
		* bridge-not-ready notice — the sections' own tolerant errors would only
		* repeat the same fact three times.
		*/
		function HubConsole() {
			const [data, setData] = (0, react.useState)(() => ({
				loaded: false,
				statusError: null,
				status: null,
				toolsError: null,
				tools: null,
				configError: null,
				config: null
			}));
			const [refreshing, setRefreshing] = (0, react.useState)(false);
			const requestRef = (0, react.useRef)(0);
			const refresh = (0, react.useCallback)(async () => {
				const requestId = requestRef.current + 1;
				requestRef.current = requestId;
				setRefreshing(true);
				const [statusAnswer, toolsAnswer, configAnswer] = await Promise.all([
					bridgeRequest("/status"),
					bridgeRequest("/tools"),
					bridgeRequest("/config")
				]);
				if (requestRef.current !== requestId) return;
				const status = statusAnswer.ok ? normalizeStatus(statusAnswer.value) : null;
				const tools = toolsAnswer.ok ? normalizeTools(toolsAnswer.value) : null;
				const config = configAnswer.ok ? normalizeConfig(configAnswer.value) : null;
				setData({
					loaded: true,
					status: status,
					statusError: status === null ? (statusAnswer.ok ? "status 响应格式不符合预期" : statusAnswer.error) : null,
					tools: tools,
					toolsError: tools === null ? (toolsAnswer.ok ? "响应里没有 tools 数组——宿主半可能尚未就绪" : toolsAnswer.error) : null,
					config: config,
					configError: config === null ? (configAnswer.ok ? "config 响应格式不符合预期" : configAnswer.error) : null
				});
				setRefreshing(false);
			}, []);
			(0, react.useEffect)(() => {
				void refresh();
			}, [refresh]);
			const bridgeReady = data.loaded && data.statusError === null;
			return (0, h)("div", { className: "apxdsh-root" },
				(0, h)(StatusRow, { data: data, refreshing: refreshing, onRefresh: () => { void refresh(); } }),
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
				bridgeReady
					? (0, h)(react.Fragment, null,
						(0, h)(ServersSection, { data: data, onRefresh: refresh }),
						(0, h)(EngineSection, { data: data, onRefresh: refresh }),
						(0, h)(ToolsSection, { data: data, onRefresh: refresh }),
						(0, h)(SearchSection, null)
					)
					: null
			);
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
			ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({
				name: "settings.plugins.tab",
				id: "aipx-hub-console",
				order: 50,
				label: "Hub Console"
			}, HubConsole));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
