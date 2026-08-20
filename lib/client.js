window.__ModuleLoader__.load({
	id: "dock-files",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		//#region src/client/ExplorerView.tsx
		/**
		* Pure file browser: a lazy recursive directory tree over the active
		* session's working directory (own /wb-files host route). Clicking a file
		* dispatches through the file-domain service (`ctx.files.open`) to a
		* registered file viewer (dock-editor) — this view never renders file
		* content itself.
		*/
		const INLINE = {
			row: {
				display: "flex",
				alignItems: "center",
				gap: 6,
				padding: "2px 8px",
				cursor: "pointer",
				borderRadius: 4,
				fontSize: 13,
				whiteSpace: "nowrap"
			},
			dim: { opacity: .55 },
			selected: { background: "var(--dsw-alias-interactive-bg-hover-accent, rgba(9, 105, 218, 0.12))" },
			err: {
				padding: "8px 12px",
				color: "#d1242f",
				fontSize: 12
			},
			loading: {
				padding: "8px 12px",
				color: "var(--dsw-alias-label-secondary, #656d76)",
				fontSize: 12
			}
		};
		function ExplorerView(props) {
			const { ctx, sessionId, active } = props;
			const [root, setRoot] = (0, react.useState)(null);
			const [entries, setEntries] = (0, react.useState)(null);
			const [children, setChildren] = (0, react.useState)(/* @__PURE__ */ new Map());
			const [expanded, setExpanded] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [selected, setSelected] = (0, react.useState)(null);
			const [menu, setMenu] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(false);
			const load = (0, react.useCallback)(async (path) => {
				setLoading(true);
				setError(null);
				try {
					const json = await (await fetch("/wb-files/list", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(path === void 0 ? { sessionId } : {
							sessionId,
							path
						})
					})).json();
					if (json.ok !== true || json.value === void 0) throw new Error(json.error?.message ?? "list failed");
					setRoot(json.value.listing.path);
					setEntries(json.value.listing.entries);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setLoading(false);
				}
			}, [sessionId]);
			(0, react.useEffect)(() => {
				setChildren(/* @__PURE__ */ new Map());
				setExpanded(/* @__PURE__ */ new Set());
				if (active) load();
			}, [
				active,
				load,
				sessionId
			]);
			/** Fetch and cache one directory level. */
			const fetchChildren = (0, react.useCallback)(async (path) => {
				try {
					const json = await (await fetch("/wb-files/list", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							sessionId,
							path
						})
					})).json();
					if (json.ok !== true || json.value === void 0) throw new Error(json.error?.message ?? "list failed");
					setChildren((previous) => {
						const next = new Map(previous);
						next.set(path, json.value.listing.entries);
						return next;
					});
				} catch {
					setExpanded((previous) => {
						const dropped = new Set(previous);
						dropped.delete(path);
						return dropped;
					});
				}
			}, [sessionId]);
			const openFile = (path) => {
				setSelected(path);
				setMenu(null);
				ctx.get("files")?.open(path, { mode: "floating" });
			};
			/** Reload one directory level (drop the cached children and refetch). */
			const refreshDir = (path) => {
				setMenu(null);
				setChildren((previous) => {
					const next = new Map(previous);
					next.delete(path);
					return next;
				});
				fetchChildren(path);
			};
			const copyPath = (path) => {
				setMenu(null);
				navigator.clipboard?.writeText(path).catch(() => {});
			};
			const toggle = (entry) => {
				if (!entry.isDir) {
					openFile(entry.path);
					return;
				}
				const willExpand = !expanded.has(entry.path);
				setExpanded((previous) => {
					const next = new Set(previous);
					if (next.has(entry.path)) next.delete(entry.path);
					else next.add(entry.path);
					return next;
				});
				if (willExpand && !children.has(entry.path)) fetchChildren(entry.path);
			};
			if (error !== null) return (0, react.createElement)("div", { style: INLINE.err }, error);
			if (entries === null) return (0, react.createElement)("div", { style: INLINE.loading }, loading ? "Loading…" : "No session");
			/** Recursively render a level of entries with running indentation. */
			const renderLevel = (list, depth) => {
				const rows = [];
				for (const entry of list) {
					const isExpanded = entry.isDir && expanded.has(entry.path);
					rows.push((0, react.createElement)("div", {
						key: entry.path,
						style: {
							...INLINE.row,
							paddingLeft: 8 + depth * 16,
							...entry.hidden ? INLINE.dim : {},
							...selected === entry.path ? INLINE.selected : {}
						},
						title: entry.path,
						onClick: () => toggle(entry),
						onContextMenu: (event) => {
							event.preventDefault();
							setMenu({
								x: event.clientX,
								y: event.clientY,
								path: entry.path,
								isDir: entry.isDir
							});
						}
					}, (0, react.createElement)("span", null, entry.isDir ? isExpanded ? "▾" : "▸" : "•"), (0, react.createElement)("span", null, entry.name)));
					if (isExpanded) {
						const kids = children.get(entry.path);
						if (kids === void 0) rows.push((0, react.createElement)("div", {
							key: `${entry.path}:loading`,
							style: {
								...INLINE.loading,
								paddingLeft: 24 + depth * 16
							}
						}, "…"));
						else rows.push(...renderLevel(kids, depth + 1));
					}
				}
				return rows;
			};
			const rows = [];
			if (root !== null) rows.push((0, react.createElement)("div", {
				key: "root",
				style: {
					...INLINE.row,
					fontWeight: 600,
					marginTop: 4
				},
				onClick: () => {
					setEntries(null);
					load();
				}
			}, "↺ ", root));
			rows.push(...renderLevel(entries, 0));
			const menuItem = (key, label, action) => (0, react.createElement)("div", {
				key,
				className: "df-context-menu-item",
				onMouseDown: action,
				onClick: action
			}, label);
			const menuItems = menu !== null && menu.isDir ? [menuItem("refresh", "刷新", () => refreshDir(menu.path)), menuItem("copy", "复制路径", () => copyPath(menu.path))] : menu !== null ? [menuItem("copy", "复制路径", () => copyPath(menu.path))] : [];
			const menuEl = menu === null ? null : (0, react.createElement)("div", {
				className: "df-context-menu",
				style: {
					left: menu.x,
					top: menu.y
				},
				onMouseDown: (event) => event.stopPropagation()
			}, ...menuItems);
			return (0, react.createElement)("div", { className: "dsh-wb-view" }, rows, menuEl !== null ? (0, react_dom.createPortal)(menuEl, document.body) : null);
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* dock-files shell styles: the file-tree context menu needs :hover/:active
		* feedback, which inline styles cannot express — injected once as a
		* <style data-plugin="dock-files"> tag (same pattern as the dock base).
		*/
		const CSS = `
.df-context-menu {
  position: fixed;
  z-index: 90;
  min-width: 140px;
  padding: 4px;
  border-radius: 8px;
  font-size: 13px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #d8dbe0);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  color: var(--dsw-alias-label-primary, #1f2328);
}
.df-context-menu-item {
  padding: 6px 10px;
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.1s ease;
}
.df-context-menu-item:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));
}
.df-context-menu-item:active {
  background: var(--dsw-alias-interactive-bg-hover-accent, rgba(90, 120, 255, 0.22));
}
`;
		function mountStyles() {
			const existing = document.querySelector("style[data-plugin=\"dock-files\"]");
			if (existing !== null) existing.remove();
			const style = document.createElement("style");
			style.setAttribute("data-plugin", "dock-files");
			style.textContent = CSS;
			document.head.appendChild(style);
			return () => {
				style.remove();
			};
		}
		//#endregion
		//#region src/client/index.ts
		/** Requires the workbench base to be mounted. */
		const inject = ["workbench"];
		/** Folder icon (fill style, currentColor), rendered by the dock shell. */
		const FOLDER_ICON = { path: "M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" };
		function baseNameOf(path) {
			const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
			return at === -1 ? path : path.slice(at + 1);
		}
		function extOfPath(path) {
			const at = path.lastIndexOf(".");
			if (at === -1) return "";
			return path.slice(at + 1).toLowerCase();
		}
		/** Build the file-domain service bound to the workbench carrier. */
		function createFilesService(workbench) {
			const viewers = /* @__PURE__ */ new Map();
			const open = (path, options) => {
				const ext = extOfPath(path);
				const matched = [...viewers.values()].find((v) => v.exts?.includes(ext)) ?? [...viewers.values()].find((v) => v.default === true);
				if (matched === void 0) {
					console.warn(`[dock-files] no file viewer registered for "${path}" (install dock-editor)`);
					return;
				}
				const seed = {
					path,
					title: options?.title ?? baseNameOf(path)
				};
				workbench.openView(matched.id, seed, { floating: options?.mode === "floating" });
			};
			const registerFileViewer = (def) => {
				viewers.set(def.id, def);
				return () => {
					if (viewers.get(def.id) === def) viewers.delete(def.id);
				};
			};
			return {
				open,
				registerFileViewer
			};
		}
		/** Client plugin body. */
		function apply(ctx) {
			const workbench = ctx.get("workbench");
			if (workbench === void 0) return;
			ctx.effect(() => mountStyles(), "dock-files: styles");
			const files = createFilesService(workbench);
			ctx.provide("files", files);
			ctx.effect(() => workbench.registerOpenPathHandler((path, options) => {
				files.open(path, {
					title: options?.title,
					mode: "floating"
				});
			}), "dock-files: open-path handler");
			ctx.effect(() => workbench.registerActivityBarItem({
				id: "files",
				title: "Files",
				icon: FOLDER_ICON,
				order: 10,
				paneId: "files"
			}), "dock-files: activity item");
			ctx.effect(() => workbench.registerPanel({
				id: "files",
				region: "sideBar",
				title: "Files",
				icon: FOLDER_ICON,
				order: 10,
				component: ExplorerView
			}), "dock-files: files panel");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map