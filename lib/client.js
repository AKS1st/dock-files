window.__ModuleLoader__.load({
	id: "dock-files",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		//#region src/client/transferStore.ts
		const TERMINAL$1 = /* @__PURE__ */ new Set([
			"completed",
			"failed",
			"cancelled",
			"skipped"
		]);
		const MAX_TOTAL = Number.MAX_VALUE;
		const TRANSITIONS = {
			queued: /* @__PURE__ */ new Set([
				"running",
				"paused",
				"failed",
				"cancelled"
			]),
			running: /* @__PURE__ */ new Set([
				"paused",
				"completed",
				"failed",
				"cancelled",
				"skipped"
			]),
			paused: /* @__PURE__ */ new Set([
				"running",
				"failed",
				"cancelled"
			]),
			completed: /* @__PURE__ */ new Set(),
			failed: /* @__PURE__ */ new Set(),
			cancelled: /* @__PURE__ */ new Set(),
			skipped: /* @__PURE__ */ new Set()
		};
		const tasks = /* @__PURE__ */ new Map();
		const controllers = /* @__PURE__ */ new Map();
		const operationTokens = /* @__PURE__ */ new Map();
		const listeners = /* @__PURE__ */ new Set();
		let sequence = 0;
		let snapshot = makeSnapshot();
		function finiteNonNegative(value, fallback = 0) {
			return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
		}
		function copyTask(task) {
			return Object.freeze({ ...task });
		}
		function errorMessage(error) {
			return error instanceof Error ? error.message : String(error);
		}
		function makeId() {
			sequence += 1;
			return `transfer-${Date.now().toString(36)}-${sequence.toString(36)}`;
		}
		function addToTotal(total, value) {
			return total > MAX_TOTAL - value ? MAX_TOTAL : total + value;
		}
		function makeSnapshot() {
			const values = Array.from(tasks.values());
			let totalTransferred = 0;
			let totalBytes = 0;
			let activeCount = 0;
			for (const task of values) {
				if (TERMINAL$1.has(task.status)) continue;
				totalTransferred = addToTotal(totalTransferred, task.transferredBytes);
				totalBytes = addToTotal(totalBytes, task.totalBytes);
				activeCount += 1;
			}
			return Object.freeze({
				tasks: Object.freeze(values),
				totalTransferred,
				totalBytes,
				activeCount
			});
		}
		function notify() {
			snapshot = makeSnapshot();
			for (const listener of listeners) try {
				listener();
			} catch {}
		}
		function setStatus(id, status) {
			const current = tasks.get(id);
			if (current === void 0 || current.status === status || !TRANSITIONS[current.status].has(status)) return current;
			const next = copyTask({
				...current,
				status,
				updatedAt: Date.now()
			});
			tasks.set(id, next);
			notify();
			return next;
		}
		function subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
		function getSnapshot() {
			return snapshot;
		}
		function createTask(input) {
			const now = Date.now();
			const task = {
				id: makeId(),
				kind: input.kind,
				name: input.name,
				sourcePath: input.sourcePath,
				...input.targetPath === void 0 ? {} : { targetPath: input.targetPath },
				...input.sessionId === void 0 ? {} : { sessionId: input.sessionId },
				totalBytes: finiteNonNegative(input.totalBytes),
				transferredBytes: Math.min(finiteNonNegative(input.transferredBytes), finiteNonNegative(input.totalBytes)),
				speedBytesPerSecond: 0,
				...input.dedupeKey === void 0 ? {} : { dedupeKey: input.dedupeKey },
				status: "queued",
				createdAt: now,
				updatedAt: now
			};
			const storedTask = copyTask(task);
			tasks.set(storedTask.id, storedTask);
			if (input.controller !== void 0) controllers.set(task.id, input.controller);
			notify();
			return copyTask(storedTask);
		}
		/** Alias emphasizing that this task is intended for a transfer pipeline. */
		const createTransferTask = createTask;
		/** Return whether an equivalent upload was created within the debounce window. */
		function hasRecentUpload(dedupeKey, now = Date.now()) {
			return Array.from(tasks.values()).some((task) => task.kind === "upload" && task.dedupeKey === dedupeKey && now - task.createdAt >= 0 && now - task.createdAt < 3e3);
		}
		function updateTask(id, patch) {
			const current = tasks.get(id);
			if (current === void 0 || TERMINAL$1.has(current.status)) return current;
			if (patch.status !== void 0 && patch.status !== current.status && !TRANSITIONS[current.status].has(patch.status)) return current;
			const totalBytes = patch.totalBytes === void 0 ? current.totalBytes : finiteNonNegative(patch.totalBytes, NaN);
			const transferredBytes = patch.transferredBytes === void 0 ? current.transferredBytes : finiteNonNegative(patch.transferredBytes, NaN);
			if (!Number.isFinite(totalBytes) || !Number.isFinite(transferredBytes)) return current;
			const now = Date.now();
			const nextTransferredBytes = Math.min(transferredBytes, totalBytes);
			const elapsedMs = Math.max(1, now - current.updatedAt);
			const byteDelta = Math.max(0, nextTransferredBytes - current.transferredBytes);
			const speedBytesPerSecond = byteDelta > 0 ? byteDelta * 1e3 / elapsedMs : current.speedBytesPerSecond;
			const next = copyTask({
				...current,
				...patch,
				status: patch.status === void 0 ? current.status : patch.status,
				totalBytes,
				transferredBytes: nextTransferredBytes,
				speedBytesPerSecond,
				id: current.id,
				createdAt: current.createdAt,
				updatedAt: now
			});
			tasks.set(id, next);
			if (TERMINAL$1.has(next.status)) controllers.delete(id);
			notify();
			return copyTask(next);
		}
		function clearCompleted(allTerminal = false) {
			for (const [id, task] of tasks) if (task.status === "completed" || task.status === "skipped" || allTerminal && TERMINAL$1.has(task.status)) {
				tasks.delete(id);
				controllers.delete(id);
			}
			notify();
		}
		function nextOperationToken(id) {
			const token = (operationTokens.get(id) ?? 0) + 1;
			operationTokens.set(id, token);
			return token;
		}
		function failOperation(id, token, error) {
			if (operationTokens.get(id) !== token) return;
			const current = tasks.get(id);
			if (current === void 0) return;
			if (TERMINAL$1.has(current.status)) return;
			updateTask(id, {
				status: "failed",
				error: errorMessage(error)
			});
		}
		async function performOperation(id, target, callback) {
			const current = tasks.get(id);
			if (current === void 0 || TERMINAL$1.has(current.status) || !TRANSITIONS[current.status].has(target)) return;
			const token = nextOperationToken(id);
			const controller = controllers.get(id);
			const isCancel = target === "cancelled";
			const next = isCancel ? current : setStatus(id, target);
			if (next === void 0 || !isCancel && next.status !== target) return;
			try {
				const handler = controller?.[callback];
				if (handler !== void 0) await handler(next);
				if (isCancel) setStatus(id, "cancelled");
			} catch (error) {
				failOperation(id, token, error);
				throw error;
			} finally {
				const final = tasks.get(id);
				if (final !== void 0 && TERMINAL$1.has(final.status)) controllers.delete(id);
			}
		}
		function startTask(id) {
			return performOperation(id, "running", "start");
		}
		function pauseTask(id) {
			return performOperation(id, "paused", "pause");
		}
		function resumeTask(id) {
			return performOperation(id, "running", "resume");
		}
		function cancelTask(id) {
			return performOperation(id, "cancelled", "cancel");
		}
		//#endregion
		//#region src/client/i18n.ts
		/** Complete dictionaries — every key below exists in BOTH locales. */
		const DICTS = {
			zh: {
				refresh: "刷新",
				collapseAll: "折叠全部",
				emptyDir: "空目录",
				noSession: "无会话",
				loading: "加载中…",
				open: "打开",
				newFile: "新建文件",
				newFolder: "新建文件夹",
				rename: "重命名",
				copy: "复制",
				cut: "剪切",
				paste: "粘贴",
				pasteWithName: "粘贴 {name}",
				pasteImage: "粘贴图片",
				delete: "删除",
				copyPath: "复制路径",
				ok: "确定",
				cancel: "取消",
				confirmDelete: "确定删除 \"{name}\"？此操作不可恢复。",
				clipboardNoImage: "剪贴板中没有图片",
				clipboardUnsupported: "当前浏览器不支持读取剪贴板图片",
				uploadBusy: "请等上一个上传任务完成",
				newFileBase: "新建文件.txt",
				newFolderBase: "新建文件夹",
				fileFallbackName: "文件",
				transferCenter: "传输中心",
				transferSummary: "{active} 个活动任务 · {progress}%",
				clearCompleted: "清除已完成",
				noTransfers: "暂无传输任务",
				upload: "上传",
				download: "下载",
				browserDownload: "浏览器下载",
				downloadFailed: "下载失败",
				symlinkSkipped: "软链接已跳过",
				pause: "暂停",
				resume: "继续",
				openTransferCenter: "打开传输中心",
				"transferStatus.queued": "排队中",
				"transferStatus.running": "进行中",
				"transferStatus.paused": "已暂停",
				"transferStatus.completed": "已完成",
				"transferStatus.failed": "失败",
				"transferStatus.cancelled": "已取消",
				"transferStatus.skipped": "已跳过"
			},
			en: {
				refresh: "Refresh",
				collapseAll: "Collapse All",
				emptyDir: "Empty directory",
				noSession: "No session",
				loading: "Loading…",
				open: "Open",
				newFile: "New File",
				newFolder: "New Folder",
				rename: "Rename",
				copy: "Copy",
				cut: "Cut",
				paste: "Paste",
				pasteWithName: "Paste {name}",
				pasteImage: "Paste Image",
				delete: "Delete",
				copyPath: "Copy Path",
				ok: "OK",
				cancel: "Cancel",
				confirmDelete: "Delete \"{name}\"? This cannot be undone.",
				clipboardNoImage: "No image in the clipboard",
				clipboardUnsupported: "Your browser cannot read clipboard images",
				uploadBusy: "Please wait for the previous upload to finish",
				newFileBase: "New File.txt",
				newFolderBase: "New Folder",
				fileFallbackName: "File",
				transferCenter: "Transfer Center",
				transferSummary: "{active} active · {progress}%",
				clearCompleted: "Clear completed",
				noTransfers: "No transfers",
				upload: "Upload",
				download: "Download",
				browserDownload: "Browser download",
				downloadFailed: "Download failed",
				symlinkSkipped: "Symbolic link skipped",
				pause: "Pause",
				resume: "Resume",
				openTransferCenter: "Open transfer center",
				"transferStatus.queued": "Queued",
				"transferStatus.running": "In progress",
				"transferStatus.paused": "Paused",
				"transferStatus.completed": "Completed",
				"transferStatus.failed": "Failed",
				"transferStatus.cancelled": "Cancelled",
				"transferStatus.skipped": "Skipped"
			}
		};
		/** Resolve the active DSH locale from the locale service, then the browser. */
		function detectLocale(ctx) {
			const active = (ctx?.get?.("locale"))?.getSnapshot?.()?.active;
			if (active === "zh" || active === "en") return active;
			if (typeof navigator !== "undefined" && typeof navigator.language === "string" && navigator.language.toLowerCase().startsWith("zh")) return "zh";
			return "en";
		}
		/** Translate one key for a locale, substituting {name} params. */
		function translate(locale, key, params) {
			const template = DICTS[locale]?.[key] ?? DICTS.zh[key] ?? key;
			if (params === void 0) return template;
			return template.replace(/\{(\w+)\}/g, (match, name) => name in params ? String(params[name]) : match);
		}
		//#endregion
		//#region src/client/hooks.ts
		/**
		* Shared client hooks for dock-files: the locale subscription hook and the
		* translate-bound function type. i18n.ts stays pure (no React import); the
		* React glue lives here (same pattern as dock-git).
		*/
		/**
		* The active DSH locale, re-resolved on every 'locale/change' event (the
		* locale service publishes the snapshot the same way getSnapshot does).
		*/
		function useLocale(ctx) {
			const [locale, setLocale] = (0, react.useState)(() => detectLocale(ctx));
			(0, react.useEffect)(() => ctx.on("locale/change", () => setLocale(detectLocale(ctx))), [ctx]);
			return locale;
		}
		//#endregion
		//#region src/client/TransferView.tsx
		const TERMINAL = /* @__PURE__ */ new Set([
			"completed",
			"skipped",
			"failed",
			"cancelled"
		]);
		function formatBytes(bytes) {
			if (bytes < 1024) return `${Math.round(bytes)} B`;
			const units = [
				"KB",
				"MB",
				"GB",
				"TB"
			];
			let value = bytes;
			let unit = -1;
			while (value >= 1024 && unit < units.length - 1) {
				value /= 1024;
				unit += 1;
			}
			return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
		}
		function statusLabel(status, t) {
			return t(`transferStatus.${status}`);
		}
		function formatSpeed(bytesPerSecond) {
			return `${formatBytes(Math.max(0, bytesPerSecond))}/s`;
		}
		function ScrollingText({ value, className, title }) {
			const ref = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				const element = ref.current;
				if (element === null) return;
				let frame = 0;
				let pauseUntil = performance.now() + 900;
				const tick = (now) => {
					const maxScroll = element.scrollWidth - element.clientWidth;
					if (maxScroll > 0 && now >= pauseUntil) {
						element.scrollLeft += .35;
						if (element.scrollLeft >= maxScroll) {
							element.scrollLeft = 0;
							pauseUntil = now + 900;
						}
					} else if (maxScroll <= 0) element.scrollLeft = 0;
					frame = requestAnimationFrame(tick);
				};
				frame = requestAnimationFrame(tick);
				return () => cancelAnimationFrame(frame);
			}, [value]);
			return (0, react.createElement)("div", {
				ref,
				className,
				title
			}, value);
		}
		function taskProgress(task) {
			if (task.totalBytes <= 0) return task.status === "completed" ? 100 : 0;
			return Math.min(100, Math.round(task.transferredBytes / task.totalBytes * 100));
		}
		function transferIcon(size = 16) {
			return (0, react.createElement)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true
			}, (0, react.createElement)("path", { d: "M12 3v12" }), (0, react.createElement)("path", { d: "m7 10 5 5 5-5" }), (0, react.createElement)("path", { d: "M5 21h14" }));
		}
		function actionButton(label, onClick) {
			return (0, react.createElement)("button", {
				type: "button",
				className: "df-transfer-action",
				onClick,
				"aria-label": label
			}, label);
		}
		function TransferView({ ctx }) {
			const locale = useLocale(ctx);
			const snapshot = (0, react.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
			const t = (key, params) => translate(locale, key, params);
			const activeTasks = snapshot.tasks.filter((task) => !TERMINAL.has(task.status));
			const totalProgress = snapshot.totalBytes > 0 ? Math.min(100, Math.round(snapshot.totalTransferred / snapshot.totalBytes * 100)) : 0;
			return (0, react.createElement)("section", { className: "df-transfer-view" }, (0, react.createElement)("header", { className: "df-transfer-header" }, (0, react.createElement)("div", { className: "df-transfer-title" }, transferIcon(), (0, react.createElement)("span", null, t("transferCenter"))), (0, react.createElement)("div", { className: "df-transfer-summary" }, t("transferSummary", {
				active: activeTasks.length,
				progress: totalProgress
			})), (0, react.createElement)("button", {
				type: "button",
				className: "df-transfer-clear",
				onClick: () => clearCompleted(true)
			}, t("clearCompleted"))), (0, react.createElement)("div", { className: "df-transfer-list" }, snapshot.tasks.length === 0 ? (0, react.createElement)("div", { className: "df-transfer-empty" }, t("noTransfers")) : snapshot.tasks.map((task) => {
				const progress = taskProgress(task);
				const canPause = task.status === "running" || task.status === "queued";
				const canResume = task.status === "paused";
				!TERMINAL.has(task.status) ? (0, react.createElement)("div", { className: "df-transfer-progress" }, (0, react.createElement)("div", { className: "df-transfer-progress-track" }, (0, react.createElement)("div", {
					className: `df-transfer-progress-fill df-transfer-progress-${task.status}`,
					style: { width: `${progress}%` }
				})), (0, react.createElement)("span", null, `${progress}% · ${formatBytes(task.transferredBytes)} / ${formatBytes(task.totalBytes)} · ${formatSpeed(task.speedBytesPerSecond)}`)) : (0, react.createElement)("span", { className: `df-transfer-status-badge df-transfer-status-${task.status}` }, statusLabel(task.status, t));
				return (0, react.createElement)("article", {
					className: `df-transfer-row df-transfer-row-${task.status}`,
					key: task.id
				}, (0, react.createElement)("div", { className: "df-transfer-main" }, (0, react.createElement)(ScrollingText, {
					className: "df-transfer-name",
					title: task.name,
					value: task.name
				}), (0, react.createElement)("div", { className: "df-transfer-kind" }, `${t(task.kind === "upload" ? "upload" : "download")} · ${statusLabel(task.status, t)}`)), (0, react.createElement)("div", { className: "df-transfer-paths" }, (0, react.createElement)(ScrollingText, {
					className: "df-transfer-path-text",
					title: task.sourcePath,
					value: task.sourcePath
				}), (0, react.createElement)("span", {
					className: "df-transfer-path-arrow",
					"aria-hidden": true
				}, "→"), (0, react.createElement)(ScrollingText, {
					className: "df-transfer-path-text",
					title: task.targetPath ?? "",
					value: task.targetPath ?? "—"
				})), (0, react.createElement)("div", { className: "df-transfer-progress" }, (0, react.createElement)("div", { className: "df-transfer-progress-track" }, (0, react.createElement)("div", {
					className: `df-transfer-progress-fill df-transfer-progress-${task.status}`,
					style: { width: `${progress}%` }
				})), (0, react.createElement)("span", { className: `df-transfer-status-badge df-transfer-status-${task.status}` }, statusLabel(task.status, t)), (0, react.createElement)("span", null, `${progress}% · ${formatBytes(task.transferredBytes)} / ${formatBytes(task.totalBytes)} · ${formatSpeed(task.speedBytesPerSecond)}`)), (0, react.createElement)("span", { className: `df-transfer-status-badge df-transfer-status-${task.status}` }, statusLabel(task.status, t)), (0, react.createElement)("div", { className: "df-transfer-actions" }, canPause ? actionButton(t("pause"), () => {
					pauseTask(task.id);
				}) : null, canResume ? actionButton(t("resume"), () => {
					resumeTask(task.id);
				}) : null, !TERMINAL.has(task.status) ? actionButton(t("cancel"), () => {
					cancelTask(task.id);
				}) : null), task.error !== void 0 ? (0, react.createElement)("div", { className: "df-transfer-error" }, task.error) : null);
			})));
		}
		function TransferStatusBar({ ctx }) {
			const locale = useLocale(ctx);
			const snapshot = (0, react.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
			const progress = snapshot.totalBytes > 0 ? Math.min(100, Math.round(snapshot.totalTransferred / snapshot.totalBytes * 100)) : 0;
			return (0, react.createElement)("button", {
				type: "button",
				className: "df-transfer-status",
				onClick: () => openTransferView(ctx.get("workbench")),
				title: translate(locale, "openTransferCenter")
			}, transferIcon(14), (0, react.createElement)("span", null, `${snapshot.activeCount} · ${progress}%`));
		}
		function openTransferView(workbench) {
			workbench?.openView("transfers", void 0, { floating: true });
		}
		//#endregion
		//#region src/client/icons.ts
		/**
		* Icon glyphs for the dock-files explorer.
		*
		* The chrome glyphs (tree arrow, tree corner, folder open/close, refresh,
		* copy, loading, warning, chevron, plus, edit, trash, right-up) are vendored
		* verbatim from the DSH harness icon set
		* `@deepseek-ai/dsh-client-ui-primitives` (ic_ds_* family, same Figma source
		* as the deepsuite icon library) — rendered with the same
		* `fill="currentColor"` convention so they follow the active theme exactly
		* like the harness shell's own icons. They are copied here (rather than
		* imported) so this plugin repo keeps building standalone, mirroring the
		* vendored `contract.ts` convention. Keep the path data in sync with
		* `packages/client/ui-primitives/src/icons/index.tsx` when it changes.
		*
		* Glyphs that are NOT in the harness set — the generic document silhouette,
		* the scissors (cut), the clipboard (paste) and the folder-plus (new folder)
		* — are drawn in the same ic_ds_ silhouette style; the document silhouette is
		* tinted per file type (Seti-like muted palette) to give the VSCode-style
		* type colour coding requested for the tree, while the chrome stays
		* theme-following.
		*/
		function svgIcon(glyph, options) {
			const size = options?.size ?? glyph.size;
			const attrs = {
				width: glyph.ratio !== void 0 ? Math.round(size * glyph.ratio) : size,
				height: size,
				viewBox: glyph.viewBox,
				fill: "none",
				"aria-hidden": true
			};
			if (options?.className !== void 0) attrs.className = options.className;
			if (options?.style !== void 0) attrs.style = options.style;
			const fill = options?.color ?? "currentColor";
			const children = glyph.layers.map((layer, index) => (0, react.createElement)("path", {
				key: index,
				d: layer.d,
				...layer.fillRule !== void 0 ? {
					fillRule: layer.fillRule,
					clipRule: layer.clipRule ?? "evenodd"
				} : {},
				...layer.opacity !== void 0 ? { opacity: layer.opacity } : {},
				...layer.transform !== void 0 ? { transform: layer.transform } : {},
				fill
			}));
			return (0, react.createElement)("svg", attrs, ...children);
		}
		/** ic_ds_triangle_right_fill_14 — tree expand arrow; consumers rotate it 90° for the open state. */
		const TRIANGLE_RIGHT = {
			viewBox: "0 0 14 14",
			size: 14,
			layers: [{ d: "M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z" }]
		};
		/** tree_corner_8x10 — session-tree "L" connector (stroke geometry pre-expanded). */
		const TREE_CORNER = {
			viewBox: "-0.5 0 8.5 10.5",
			size: 10,
			ratio: .8,
			layers: [{ d: "M0 0L-0.5 0L-0.5 7L0 7L0.5 7L0.5 0L0 0ZM3 10L3 10.5L8 10.5L8 10L8 9.5L3 9.5L3 10ZM0 7L-0.5 7C-0.5 8.933 1.067 10.5 3 10.5L3 10L3 9.5C1.61929 9.5 0.5 8.38071 0.5 7L0 7Z" }]
		};
		/** ic_ds_folder_close_16. */
		const FOLDER_CLOSE = {
			viewBox: "0 0 16 16",
			size: 16,
			layers: [{
				transform: "translate(1.5 2.429)",
				d: "M5.05582 0.518756L4.50669 0.86654L5.05582 0.518756ZM13 9.4837L13.65 9.4837L13.65 3.53962L13 3.53962L12.35 3.53962L12.35 9.4837L13 9.4837ZM11.3264 1.86603L11.3264 1.21603L6.52313 1.21603L6.52313 1.86603L6.52313 2.51603L11.3264 2.51603L11.3264 1.86603ZM5.58054 1.34727L6.12968 0.999489L5.60495 0.170972L5.05582 0.518756L4.50669 0.86654L5.03141 1.69506L5.58054 1.34727ZM4.11323 1.23058e-13L4.11323 -0.65L1.67359 -0.65L1.67359 5.00699e-14L1.67359 0.65L4.11323 0.65L4.11323 1.23058e-13ZM0 1.67359L-0.65 1.67359L-0.65 9.4837L0 9.4837L0.65 9.4837L0.65 1.67359L0 1.67359ZM11.3264 11.1573L11.3264 10.5073L1.67359 10.5073L1.67359 11.1573L1.67359 11.8073L11.3264 11.8073L11.3264 11.1573ZM0 9.4837L-0.65 9.4837C-0.65 10.767 0.390308 11.8073 1.67359 11.8073L1.67359 11.1573L1.67359 10.5073C1.10828 10.5073 0.65 10.049 0.65 9.4837L0 9.4837ZM1.67359 5.00699e-14L1.67359 -0.65C0.390307 -0.65 -0.65 0.390309 -0.65 1.67359L0 1.67359L0.65 1.67359C0.65 1.10828 1.10828 0.65 1.67359 0.65L1.67359 5.00699e-14ZM5.05582 0.518756L5.60495 0.170972C5.28121 -0.340193 4.71829 -0.65 4.11323 -0.65L4.11323 1.23058e-13L4.11323 0.65C4.27282 0.65 4.4213 0.731715 4.50669 0.86654L5.05582 0.518756ZM6.52313 1.86603L6.52313 1.21603C6.36354 1.21603 6.21507 1.13431 6.12968 0.999489L5.58054 1.34727L5.03141 1.69506C5.35515 2.20622 5.91808 2.51603 6.52313 2.51603L6.52313 1.86603ZM13 3.53962L13.65 3.53962C13.65 2.25634 12.6097 1.21603 11.3264 1.21603L11.3264 1.86603L11.3264 2.51603C11.8917 2.51603 12.35 2.97431 12.35 3.53962L13 3.53962ZM13 9.4837L12.35 9.4837C12.35 10.049 11.8917 10.5073 11.3264 10.5073L11.3264 11.1573L11.3264 11.8073C12.6097 11.8073 13.65 10.767 13.65 9.4837L13 9.4837Z"
			}]
		};
		/** ic_ds_folder_open_16 (outline + 20%-opacity inner fill, both currentColor). */
		const FOLDER_OPEN = {
			viewBox: "0 0 16 16",
			size: 16,
			layers: [{ d: "M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z" }, {
				opacity: .2,
				d: "M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z"
			}]
		};
		/** ic_ds_refresh_outline_16. */
		const REFRESH = {
			viewBox: "0 0 16 16",
			size: 16,
			layers: [{ d: "M7.92136 0.349152C10.3744 0.349234 12.5564 1.5052 13.9557 3.29894L15.1281 2.12759C15.3303 1.92546 15.6767 2.06943 15.6767 2.35538V5.53923C15.6766 5.71626 15.5329 5.85976 15.3559 5.86002H12.171C11.8854 5.8597 11.7426 5.51465 11.9443 5.31249L12.9641 4.29056C11.8237 2.74305 9.98908 1.74106 7.92136 1.74097C4.46436 1.74097 1.66233 4.543 1.66233 8C1.66233 11.457 4.46436 14.259 7.92136 14.259C11.3782 14.2589 14.1804 11.4569 14.1804 8H15.5722C15.5722 12.2251 12.1465 15.6507 7.92136 15.6508C3.69614 15.6508 0.270508 12.2252 0.270508 8C0.270508 3.77478 3.69614 0.349152 7.92136 0.349152Z" }]
		};
		/** ic_ds_copy_outline_16. */
		const COPY = {
			viewBox: "0 0 16 16",
			size: 16,
			layers: [{ d: "M6.14929 4.02032C7.11197 4.02032 7.87983 4.02016 8.49597 4.07598C9.12128 4.13269 9.65792 4.25188 10.1415 4.53106C10.7202 4.8653 11.2008 5.3459 11.535 5.92462C11.8142 6.40818 11.9334 6.94481 11.9901 7.57012C12.0459 8.18625 12.0458 8.95419 12.0458 9.9168C12.0458 10.8795 12.0459 11.6473 11.9901 12.2635C11.9334 12.8888 11.8142 13.4254 11.535 13.909C11.2008 14.4877 10.7202 14.9683 10.1415 15.3025C9.65792 15.5817 9.12128 15.7009 8.49597 15.7576C7.87984 15.8134 7.11196 15.8133 6.14929 15.8133C5.18667 15.8133 4.41874 15.8134 3.80261 15.7576C3.1773 15.7009 2.64067 15.5817 2.1571 15.3025C1.5784 14.9683 1.09778 14.4877 0.76355 13.909C0.484366 13.4254 0.365184 12.8888 0.308472 12.2635C0.252649 11.6473 0.252808 10.8795 0.252808 9.9168C0.252808 8.95418 0.252664 8.18625 0.308472 7.57012C0.365184 6.94481 0.484366 6.40818 0.76355 5.92462C1.09777 5.34589 1.57839 4.86529 2.1571 4.53106C2.64067 4.25188 3.1773 4.13269 3.80261 4.07598C4.41874 4.02017 5.18666 4.02032 6.14929 4.02032ZM6.14929 5.37774C5.16181 5.37774 4.46634 5.37761 3.92566 5.42657C3.39434 5.47472 3.07859 5.56574 2.83582 5.70587C2.4632 5.92106 2.15354 6.2307 1.93835 6.60333C1.79823 6.8461 1.70721 7.16185 1.65906 7.69317C1.6101 8.23385 1.61023 8.92933 1.61023 9.9168C1.61023 10.9043 1.61009 11.5998 1.65906 12.1404C1.70721 12.6717 1.79823 12.9875 1.93835 13.2303C2.15356 13.6029 2.46321 13.9126 2.83582 14.1277C3.07859 14.2679 3.39434 14.3589 3.92566 14.407C4.46634 14.456 5.16182 14.4559 6.14929 14.4559C7.13682 14.4559 7.83224 14.456 8.37292 14.407C8.90425 14.3589 9.21999 14.2679 9.46277 14.1277C9.83535 13.9126 10.145 13.6029 10.3602 13.2303C10.5004 12.9875 10.5914 12.6717 10.6395 12.1404C10.6885 11.5998 10.6884 10.9043 10.6884 9.9168C10.6884 8.92934 10.6885 8.23384 10.6395 7.69317C10.5914 7.16185 10.5004 6.8461 10.3602 6.60333C10.1451 6.23071 9.83536 5.92107 9.46277 5.70587C9.21999 5.56574 8.90424 5.47472 8.37292 5.42657C7.83224 5.3776 7.13682 5.37774 6.14929 5.37774ZM9.80164 0.367975C10.7638 0.367975 11.5314 0.36788 12.1473 0.423639C12.7726 0.480307 13.3093 0.598759 13.7928 0.877741C14.3717 1.21192 14.8521 1.69355 15.1864 2.27227C15.4655 2.75574 15.5857 3.29164 15.6425 3.9168C15.6983 4.53301 15.6971 5.3016 15.6971 6.26446V7.82989C15.6971 8.29264 15.6989 8.58993 15.6649 8.84844C15.4668 10.3525 14.401 11.5738 12.9833 11.9988V10.5467C13.6973 10.1903 14.2105 9.49662 14.3192 8.67169C14.3387 8.52347 14.3407 8.3358 14.3407 7.82989V6.26446C14.3407 5.27706 14.3398 4.58149 14.2909 4.04083C14.2428 3.50968 14.1526 3.19372 14.0126 2.95098C13.7974 2.57849 13.4876 2.26869 13.1151 2.05352C12.8724 1.91347 12.5564 1.82237 12.0253 1.77423C11.4847 1.72528 10.7888 1.7254 9.80164 1.7254H7.71472C6.7562 1.72558 5.92665 2.27697 5.52332 3.07891H4.07019C4.54221 1.51132 5.9932 0.368186 7.71472 0.367975H9.80164Z" }]
		};
		/** ic_ds_loading_outline_16 — an open ring; consumers spin it with CSS. */
		const LOADING = {
			viewBox: "0 0 16 16",
			size: 16,
			layers: [{ d: "M2.871 13.1286C0.0387669 10.2962 0.0387669 5.70383 2.871 2.87141C5.70341 0.0390029 10.2957 0.0391154 13.1282 2.87141L12.1387 3.86094C9.85292 1.57538 6.1469 1.57596 3.86123 3.86163C1.57573 6.14732 1.57573 9.85269 3.86123 12.1384C6.1469 14.424 9.85292 14.4246 12.1387 12.1391L13.1282 13.1286C10.2957 15.9609 5.70341 15.961 2.871 13.1286Z" }]
		};
		/** ic_ds_warning_outline_16. */
		const WARNING = {
			viewBox: "0 0 14 14",
			size: 14,
			layers: [
				{ d: "M6.3002 3.32843L7.69986 3.32843L7.69986 7.79657H6.3002L6.3002 3.32843Z" },
				{ d: "M6.3002 9.01935H7.69986V10.6711H6.3002V9.01935Z" },
				{ d: "M12.6328 6.99976C12.6328 3.88874 10.111 1.36694 7 1.36694C3.88899 1.36695 1.3672 3.88875 1.36719 6.99976C1.36719 10.1108 3.88899 12.6326 7 12.6326C10.111 12.6326 12.6328 10.1108 12.6328 6.99976ZM13.8582 6.99976C13.8582 10.7873 10.7876 13.8579 7 13.8579C3.21244 13.8579 0.141846 10.7873 0.141846 6.99976C0.141857 3.2122 3.21245 0.141612 7 0.141602C10.7876 0.141602 13.8581 3.21219 13.8582 6.99976Z" }
			]
		};
		/** Compact opposing chevrons — a single, balanced "collapse all" glyph. */
		const COLLAPSE_ALL = {
			viewBox: "0 0 16 14",
			size: 14,
			ratio: 16 / 14,
			layers: [{ d: "M1.5 3.5L5.5 7L1.5 10.5L2.45 11.55L7.65 7L2.45 2.45L1.5 3.5Z" }, { d: "M14.5 3.5L10.5 7L14.5 10.5L13.55 11.55L8.35 7L13.55 2.45L14.5 3.5Z" }]
		};
		/** Upload arrow into a tray — imports OS files into the current directory. */
		const UPLOAD = {
			viewBox: "0 0 16 16",
			size: 16,
			layers: [{ d: "M7.35 10.5V3.95L5.1 6.2L4.05 5.15L8 1.2L11.95 5.15L10.9 6.2L8.65 3.95V10.5H7.35Z" }, { d: "M2.2 9.5H3.5V13.5H12.5V9.5H13.8V13.5C13.8 14.22 13.22 14.8 12.5 14.8H3.5C2.78 14.8 2.2 14.22 2.2 13.5V9.5Z" }]
		};
		/** ic_ds_plus_outline_16 — new file. */
		const PLUS = {
			viewBox: "0 0 16 16",
			size: 16,
			layers: [{ d: "M8.64453 1.5V7.34961H14.5V8.65039H8.64453V14.5H7.34473V8.65039H1.5V7.34961H7.34473V1.5H8.64453Z" }]
		};
		/** ic_ds_edit_outline_16 — rename. */
		const EDIT = {
			viewBox: "0 0 16 16",
			size: 16,
			layers: [{ d: "M9.94076 1.34942C10.7047 0.90231 11.6503 0.902415 12.4143 1.34942C12.7061 1.52015 12.9688 1.79118 13.3104 2.13284C13.6521 2.47448 13.9231 2.73721 14.0939 3.02894C14.5408 3.79294 14.5409 4.73856 14.0939 5.50251C13.9231 5.79415 13.652 6.05704 13.3104 6.39861L6.65932 13.0497C6.28068 13.4284 6.00695 13.7108 5.66543 13.9097C5.32391 14.1085 4.94315 14.2074 4.42705 14.3498L3.24394 14.6761C2.77527 14.8054 2.34538 14.9262 2.00131 14.9684C1.65196 15.0112 1.17964 15.0013 0.810764 14.6325C0.441921 14.2637 0.432107 13.7913 0.47486 13.442C0.517035 13.0979 0.6379 12.668 0.767181 12.1993L1.09352 11.0162C1.23588 10.5001 1.33481 10.1193 1.5336 9.77784C1.7325 9.43632 2.0149 9.1626 2.39355 8.78395L9.04466 2.13284C9.38625 1.79126 9.64911 1.52016 9.94076 1.34942ZM15.5427 14.8398H7.55223L8.96707 13.425H15.5427V14.8398ZM3.39382 9.78422C2.965 10.213 2.84244 10.3436 2.75709 10.49C2.67183 10.6366 2.61862 10.8079 2.45733 11.3925L2.13099 12.5756C2.00183 13.0439 1.92194 13.3419 1.88863 13.5536C2.10041 13.5204 2.39872 13.4416 2.86764 13.3123L4.05075 12.9859C4.63544 12.8246 4.80669 12.7715 4.95323 12.6862C5.09968 12.6008 5.23022 12.4783 5.65905 12.0494L10.721 6.98644L8.45577 4.72121L3.39382 9.78422ZM11.7 2.57079C11.3774 2.38198 10.9777 2.38198 10.6551 2.57079C10.5602 2.62647 10.4487 2.72931 10.0449 3.13311L9.45604 3.72094L11.7213 5.98617L12.3102 5.39833C12.7139 4.99457 12.8168 4.88307 12.8725 4.78818C13.0613 4.46561 13.0612 4.06585 12.8725 3.74326C12.8169 3.64827 12.7146 3.53752 12.3102 3.13311C11.9057 2.72863 11.795 2.6264 11.7 2.57079Z" }]
		};
		/** ic_ds_trash_outline_16 — delete. */
		const TRASH = {
			viewBox: "0 0 16 16",
			size: 16,
			layers: [{ d: "M14.4782 4.84067L14.2138 10.1152C14.1102 12.1872 14.067 13.0115 13.3866 13.9607C13.1044 14.3546 12.7498 14.6912 12.3424 14.9535C11.8239 15.2872 11.2415 15.4316 10.5585 15.4998C9.88727 15.5668 9.04946 15.5656 7.99998 15.5656C6.95051 15.5656 6.1127 15.5668 5.44142 15.4998C4.75851 15.4316 4.17602 15.2872 3.65753 14.9535C3.25012 14.6912 2.89559 14.3546 2.61332 13.9607C1.93296 13.0115 1.88979 12.1872 1.78619 10.1152L1.52179 4.84067L2.89006 4.77277L3.15343 10.0463C3.26221 12.2218 3.32452 12.6015 3.72646 13.1624C3.90825 13.4161 4.13686 13.6334 4.39927 13.8023C4.66204 13.9714 5.00263 14.0792 5.57825 14.1367C6.16562 14.1953 6.92298 14.1963 7.99998 14.1963C9.07699 14.1963 9.83434 14.1953 10.4217 14.1367C10.9973 14.0792 11.3379 13.9714 11.6007 13.8023C11.8631 13.6334 12.0917 13.4161 12.2735 13.1624C12.6755 12.6015 12.7378 12.2218 12.8465 10.0463L13.1099 4.77277L14.4782 4.84067ZM5.43011 6.22849H6.7994V11.3909H5.43011V6.22849ZM9.20056 6.22849H10.5699V11.3909H9.20056V6.22849ZM8.53597 0.434431C9.17976 0.434431 9.6522 0.426926 10.0966 0.571258C10.2357 0.616451 10.3717 0.672554 10.502 0.738948C10.9182 0.951107 11.2464 1.29099 11.7015 1.74612L12.4978 2.54136H15.3742V3.91169H0.625732V2.54136H3.50218L4.29845 1.74612C4.75358 1.29099 5.08174 0.951107 5.49801 0.738948C5.62831 0.672554 5.76425 0.616451 5.90334 0.571258C6.34776 0.426926 6.82021 0.434431 7.46399 0.434431H8.53597ZM7.46399 1.80476C6.73208 1.80476 6.51641 1.81187 6.32617 1.87369C6.25545 1.89667 6.18668 1.92533 6.12041 1.95907C5.96398 2.03878 5.82348 2.16253 5.44142 2.54136H10.5585C10.1765 2.16253 10.036 2.03878 9.87955 1.95907C9.81329 1.92533 9.74452 1.89667 9.6738 1.87369C9.48356 1.81187 9.26789 1.80476 8.53597 1.80476H7.46399Z" }]
		};
		/** ic_ds_right_up_outline_16 — open. */
		const OPEN = {
			viewBox: "0 0 16 16",
			size: 16,
			layers: [{ d: "M13.588429 5.147807C13.588429 4.739638 13.587271 4.403003 13.582013 4.118684L1.703098 15.99968L0.85155 15.148178L0 14.294485L11.878915 2.413442C11.594721 2.408199 11.257569 2.409154 10.849776 2.409154H2.400594V0.000001H10.849776C11.644471 0.000001 12.338899 -0.001059 12.901622 0.059909C13.486363 0.123352 14.071136 0.265493 14.598303 0.648292C14.886598 0.857751 15.141981 1.110984 15.351433 1.399281C15.734578 1.926807 15.876362 2.512925 15.939743 3.098105C16.000775 3.660718 15.99968 4.353347 15.99968 5.147807V13.599133H13.588429V5.147807Z" }]
		};
		/** Scissors (self-drawn ic_ds silhouette style) — cut: two finger rings
		*  and a pair of blades splayed toward the right. */
		const CUT = {
			viewBox: "0 0 16 16",
			size: 16,
			layers: [
				{ d: "M4.5 2.7a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8Z" },
				{ d: "M4.5 9.5a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8Z" },
				{ d: "M6.2 3.6L14.1 2.2l.4 1.3L6.6 5.4 6.2 3.6Z" },
				{ d: "M6.2 9.6L14.1 7.4l.4 1.3L6.6 11.7 6.2 9.6Z" }
			]
		};
		/** Clipboard (self-drawn ic_ds silhouette style) — paste: a tabbed board
		*  with rounded corners. */
		const PASTE = {
			viewBox: "0 0 16 16",
			size: 16,
			layers: [{ d: "M6 2.8h4v.8h1.2a1.2 1.2 0 0 1 1.2 1.2v9a1.2 1.2 0 0 1-1.2 1.2H4.8a1.2 1.2 0 0 1-1.2-1.2v-9a1.2 1.2 0 0 1 1.2-1.2H6V2.8Z" }]
		};
		/** Folder with a plus badge (self-drawn) — new folder: the closed-folder
		*  glyph plus a plus centred on its body. */
		const FOLDER_PLUS = {
			viewBox: "0 0 16 16",
			size: 16,
			layers: [FOLDER_CLOSE.layers[0], { d: "M7.3 6.5h1.4v.8h1.8v1.4H8.7v1.8H7.3V8.7H5.5V7.3h1.8V6.5Z" }]
		};
		/** Picture frame (self-drawn ic_ds silhouette style) — paste image: a
		*  rounded frame with a sun circle and a mountain. */
		const IMAGE = {
			viewBox: "0 0 16 16",
			size: 16,
			layers: [
				{ d: "M2.9 3.4h10.2a1.1 1.1 0 0 1 1.1 1.1v7a1.1 1.1 0 0 1-1.1 1.1H2.9a1.1 1.1 0 0 1-1.1-1.1v-7a1.1 1.1 0 0 1 1.1-1.1Z" },
				{ d: "M5.4 5a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z" },
				{ d: "M3.5 11.4L7 7.9l2.2 2.2 1.9-1.9 2.6 2.6-0.5 0.6H3.5Z" }
			]
		};
		/**
		* Generic document silhouette drawn in the ic_ds_ style: the fold corner is
		* a hole (fillRule evenodd) so the glyph reads as a page with a folded
		* corner. Tinted per type through the `color` option.
		*/
		const FILE_GLYPH = {
			viewBox: "0 0 16 16",
			size: 14,
			layers: [{
				fillRule: "evenodd",
				d: "M9.25 0.75H4.5A1.75 1.75 0 0 0 2.75 2.5v11a1.75 1.75 0 0 0 1.75 1.75h7a1.75 1.75 0 0 0 1.75-1.75V5.5L9.25 0.75ZM9.25 1.9L12.6 5.5H9.25V1.9Z"
			}]
		};
		/** Seti-like muted per-type palette (readable on both light and dark themes). */
		const FILE_TYPE_COLORS = {
			ts: "#519aba",
			tsx: "#519aba",
			mts: "#519aba",
			cts: "#519aba",
			js: "#d9a741",
			jsx: "#d9a741",
			mjs: "#d9a741",
			cjs: "#d9a741",
			json: "#c9c64d",
			md: "#4aa3df",
			markdown: "#4aa3df",
			mdx: "#4aa3df",
			yml: "#d4633a",
			yaml: "#d4633a",
			toml: "#d4633a",
			ini: "#d4633a",
			css: "#42a5f5",
			scss: "#42a5f5",
			sass: "#42a5f5",
			less: "#42a5f5",
			html: "#e44d26",
			htm: "#e44d26",
			png: "#a074c4",
			jpg: "#a074c4",
			jpeg: "#a074c4",
			gif: "#a074c4",
			webp: "#a074c4",
			svg: "#a074c4",
			ico: "#a074c4",
			bmp: "#a074c4",
			avif: "#a074c4",
			pdf: "#e05151",
			py: "#3572a5",
			pyc: "#3572a5",
			sh: "#6ab04c",
			bash: "#6ab04c",
			zsh: "#6ab04c"
		};
		/** Fallback tint for unclassified files / dotfiles. */
		const GENERIC_FILE_COLOR = "#8b949e";
		function extOf(name) {
			const at = name.lastIndexOf(".");
			return at === -1 ? "" : name.slice(at + 1).toLowerCase();
		}
		/** Folder glyph: closed (theme tint) or open. */
		function folderIcon(open, size = 14) {
			return svgIcon(open ? FOLDER_OPEN : FOLDER_CLOSE, { size });
		}
		/**
		* Per-type file glyph with the full precedence: a registered extension-matched
		* `extIcon` wins outright; otherwise the built-in per-type palette; otherwise
		* the default viewer's `fallbackIcon`; otherwise the generic gray. A custom
		* `path` (ext icon first, then the default icon for palette-unknown types)
		* replaces the generic document silhouette.
		*/
		function fileIcon(name, extIcon, fallbackIcon, size = 14) {
			const paletteColor = FILE_TYPE_COLORS[extOf(name)];
			const color = extIcon?.color ?? paletteColor ?? fallbackIcon?.color ?? GENERIC_FILE_COLOR;
			const custom = extIcon?.path !== void 0 ? extIcon : paletteColor === void 0 && fallbackIcon?.path !== void 0 ? fallbackIcon : void 0;
			if (custom !== void 0) return svgIcon({
				viewBox: custom.viewBox ?? "0 0 16 16",
				size,
				layers: [{
					d: custom.path,
					fillRule: "evenodd"
				}]
			}, {
				size,
				color
			});
			return svgIcon(FILE_GLYPH, {
				size,
				color
			});
		}
		/** Tree expand arrow (rotate 90° via CSS for the open state). */
		function treeArrow(size = 10) {
			return svgIcon(TRIANGLE_RIGHT, { size });
		}
		/** Tree guide "L" connector (8×10, tinted by the row's CSS color). */
		function treeCorner(size = 10) {
			return svgIcon(TREE_CORNER, { size });
		}
		function refreshIcon(size = 14, className) {
			return svgIcon(REFRESH, {
				size,
				className
			});
		}
		function copyIcon(size = 14) {
			return svgIcon(COPY, { size });
		}
		function plusIcon(size = 14) {
			return svgIcon(PLUS, { size });
		}
		function uploadIcon(size = 14) {
			return svgIcon(UPLOAD, { size });
		}
		function editIcon(size = 14) {
			return svgIcon(EDIT, { size });
		}
		function trashIcon(size = 14) {
			return svgIcon(TRASH, { size });
		}
		/** Open arrow (points up-right). */
		function openIcon(size = 14) {
			return svgIcon(OPEN, { size });
		}
		function cutIcon(size = 14) {
			return svgIcon(CUT, { size });
		}
		function pasteIcon(size = 14) {
			return svgIcon(PASTE, { size });
		}
		function newFolderIcon(size = 14) {
			return svgIcon(FOLDER_PLUS, { size });
		}
		/** Picture frame — paste a clipboard image. */
		function imageIcon(size = 14) {
			return svgIcon(IMAGE, { size });
		}
		/** Open loading ring; consumers spin it with the .df-spin class. */
		function loadingIcon(size = 14, className) {
			return svgIcon(LOADING, {
				size,
				className
			});
		}
		function warningIcon(size = 14) {
			return svgIcon(WARNING, { size });
		}
		function collapseAllIcon(size = 14) {
			return svgIcon(COLLAPSE_ALL, { size });
		}
		//#endregion
		//#region src/client/ExplorerView.tsx
		/**
		* Pure file browser with file-manager operations: a lazy recursive directory
		* tree over the active session's working directory (own /wb-files host
		* route). Clicking a file dispatches through the file-domain service
		* (`ctx.files.open`) to a registered file viewer (dock-editor) — this view
		* never renders file content itself.
		*
		* Modern VSCode-style presentation: a toolbar (root directory + refresh +
		* collapse-all), per-type tinted file glyphs, tree guide lines, hover
		* action buttons, a modern context menu and styled states. The context menu
		* carries the usual file-manager actions — new file / new folder (with
		* inline rename), rename, copy / cut / paste, paste image from the system
		* clipboard, delete (confirmed), copy path, refresh — plus an empty-area
		* menu for the root directory. Drag & drop: entries can be dragged onto
		* directories (or the empty area) to move them, and OS files can be dropped
		* in to import copies; dropping onto a file row moves/imports into that
		* file's parent directory so imprecise drops still land. Local files copied
		* in the OS can also be pasted with Ctrl+V while the panel is focused (the
		* browser only exposes them through the paste event). Transfers are
		* serialized (one at a time, others are prompted to wait) and show a 1px
		* progress bar at the panel's bottom. All glyphs are the vendored harness
		* ic_ds_* icon set (see ./icons.ts).
		*/
		/** Stable no-op subscription/snapshot for useSyncExternalStore without the files service. */
		const NOOP_SUBSCRIBE = () => () => {};
		const NOOP_SNAPSHOT = () => 0;
		const TRANSFER_NOOP_SUBSCRIBE = () => () => {};
		/** Call one /wb-files host method; throws on non-ok responses. */
		async function callFiles(method, payload) {
			const json = await (await fetch(`/wb-files/${method}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload)
			})).json();
			if (json.ok !== true || json.value === void 0) throw new Error(json.error?.message ?? `${method} failed`);
			return json.value;
		}
		function baseNameOf$1(path) {
			const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
			return at === -1 ? path : path.slice(at + 1);
		}
		/** Parent directory of a path, or null at the filesystem root. */
		function parentPathOf(path) {
			const at = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
			if (at === -1) return null;
			return at === 0 ? path.startsWith("\\") ? "\\" : "/" : path.slice(0, at);
		}
		/** Read a Blob as a base64 data URL (used for clipboard images and uploads). */
		function blobToDataUrl(blob) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => resolve(String(reader.result));
				reader.onerror = () => reject(reader.error ?? /* @__PURE__ */ new Error("failed to read image"));
				reader.readAsDataURL(blob);
			});
		}
		function ExplorerView(props) {
			const { ctx, sessionId, active } = props;
			const files = ctx.get("files");
			(0, react.useSyncExternalStore)(files?.subscribe ?? NOOP_SUBSCRIBE, files?.getIconVersion ?? NOOP_SNAPSHOT);
			const transferSnapshot = (0, react.useSyncExternalStore)(subscribe ?? TRANSFER_NOOP_SUBSCRIBE, getSnapshot);
			const totalTransferProgress = transferSnapshot.totalBytes > 0 ? Math.min(100, Math.round(transferSnapshot.totalTransferred / transferSnapshot.totalBytes * 100)) : 0;
			const locale = useLocale(ctx);
			const t = (0, react.useCallback)((key, params) => translate(locale, key, params), [locale]);
			const [root, setRoot] = (0, react.useState)(null);
			const [entries, setEntries] = (0, react.useState)(null);
			const [children, setChildren] = (0, react.useState)(/* @__PURE__ */ new Map());
			const [expanded, setExpanded] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [selected, setSelected] = (0, react.useState)(null);
			const [menu, setMenu] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(false);
			const [clipboard, setClipboard] = (0, react.useState)(null);
			const [renaming, setRenaming] = (0, react.useState)(null);
			/** Clipboard-image probe result for the current menu. */
			const [imageProbe, setImageProbe] = (0, react.useState)("unknown");
			const uploadInputRef = (0, react.useRef)(null);
			const uploadDestRef = (0, react.useRef)(null);
			const [dialog, setDialog] = (0, react.useState)(null);
			/** Internal drag: the path being dragged (dimmed), and the highlighted drop target. */
			const [dragSource, setDragSource] = (0, react.useState)(null);
			const [dragOver, setDragOver] = (0, react.useState)(null);
			/** Ctrl+V paste target: the last clicked/right-clicked directory (null = root). */
			const [pasteDir, setPasteDir] = (0, react.useState)(null);
			const menuRef = (0, react.useRef)(null);
			const viewRef = (0, react.useRef)(null);
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
				setClipboard(null);
				setImageProbe("unknown");
				setRenaming(null);
				setDragSource(null);
				setDragOver(null);
				setPasteDir(null);
				if (active) load();
			}, [
				active,
				load,
				sessionId
			]);
			/**
			* Fetch and cache one directory level. `keepExpanded` (used by refresh
			* flows) leaves the node as-is on failure instead of collapsing it.
			*/
			const fetchChildren = (0, react.useCallback)(async (path, keepExpanded = false) => {
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
					if (keepExpanded) return;
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
			/**
			* Refresh one directory level in place: refetch its children without
			* clearing the current cache, so an expanded directory never collapses or
			* flashes a spinner while refreshing (a failed refetch leaves it as-is).
			*/
			const refreshDir = (path) => {
				setMenu(null);
				fetchChildren(path, true);
			};
			const copyPath = (path) => {
				setMenu(null);
				navigator.clipboard?.writeText(path).catch(() => {});
			};
			/** Collapse every expanded directory (the child cache is kept). */
			const collapseAll = () => {
				setMenu(null);
				setExpanded(/* @__PURE__ */ new Set());
			};
			/** Show a themed alert (replaces the native browser alert). */
			const alertDialog = (message) => {
				setDialog({
					kind: "alert",
					message
				});
			};
			/** Show a themed confirm; `onConfirm` runs when the primary button is pressed. */
			const confirmDialog = (message, onConfirm, options) => {
				setDialog({
					kind: "confirm",
					message,
					onConfirm,
					confirmLabel: options?.confirmLabel ?? "ok",
					danger: options?.danger
				});
			};
			/** Report a mutation error through the themed alert. */
			const reportError = (cause) => {
				alertDialog(cause instanceof Error ? cause.message : String(cause));
			};
			/** Refetch the directory that contains `path` (the root reloads fully). */
			const refreshParentOf = (path) => {
				const parent = parentPathOf(path);
				if (parent === null || parent === root) load();
				else refreshDir(parent);
			};
			/** Refetch a directory's own contents (the root reloads fully). */
			const refreshDirContents = (dir) => {
				if (dir === root) load();
				else refreshDir(dir);
			};
			const beginRename = (path) => {
				setMenu(null);
				setSelected(path);
				setRenaming({
					path,
					value: baseNameOf$1(path)
				});
			};
			const cancelRename = () => setRenaming(null);
			const commitRename = () => {
				if (renaming === null) return;
				const { path, value } = renaming;
				const name = value.trim();
				setRenaming(null);
				if (name === "" || name === baseNameOf$1(path)) return;
				(async () => {
					try {
						await callFiles("rename", {
							sessionId,
							path,
							name
						});
						refreshParentOf(path);
					} catch (cause) {
						reportError(cause);
					}
				})();
			};
			/** Create a new entry and drop straight into inline rename. */
			const startCreate = (kind, parent) => {
				setMenu(null);
				(async () => {
					try {
						const value = await callFiles("create", {
							sessionId,
							parent,
							kind,
							locale
						});
						const path = String(value.path ?? "");
						if (parent === root) load();
						else {
							setExpanded((previous) => {
								const next = new Set(previous);
								next.add(parent);
								return next;
							});
							refreshDir(parent);
						}
						setRenaming({
							path,
							value: String(value.name ?? baseNameOf$1(path))
						});
					} catch (cause) {
						reportError(cause);
					}
				})();
			};
			const setClip = (mode, path) => {
				setMenu(null);
				setSelected(path);
				setClipboard({
					mode,
					path
				});
			};
			/** Paste the clipboard item into `dest` (copy keeps the clipboard; cut clears it). */
			const pasteInto = (dest) => {
				setMenu(null);
				if (clipboard === null) return;
				const { mode, path: source } = clipboard;
				(async () => {
					try {
						await callFiles(mode === "copy" ? "copy" : "move", {
							sessionId,
							sources: [source],
							dest
						});
						if (mode === "cut") {
							refreshParentOf(source);
							setClipboard(null);
						}
						refreshDirContents(dest);
					} catch (cause) {
						reportError(cause);
					}
				})();
			};
			/** Probe clipboard images while opening a menu. */
			const probeClipboardContents = () => {
				setImageProbe("unknown");
				(async () => {
					let hasImage = false;
					try {
						if (typeof navigator.clipboard !== "undefined" && typeof navigator.clipboard.read === "function") {
							const items = await navigator.clipboard.read();
							for (const item of items) hasImage ||= item.types.some((type) => type.startsWith("image/"));
						}
					} catch {}
					setImageProbe(hasImage ? "has" : "none");
				})();
			};
			/** Open the native multi-file picker for a known destination directory. */
			const chooseUpload = (dest) => {
				setMenu(null);
				uploadDestRef.current = dest;
				uploadInputRef.current?.click();
			};
			const onUploadInputChange = (event) => {
				const input = event.currentTarget;
				const dest = uploadDestRef.current ?? root;
				uploadDestRef.current = null;
				if (dest !== null && input.files !== null) uploadFiles(input.files, dest);
				input.value = "";
			};
			const openRootContextMenu = (event, directoryTarget = false) => {
				if (root === null) return;
				event.preventDefault();
				event.stopPropagation();
				setPasteDir(directoryTarget ? root : null);
				setMenu({
					x: event.clientX,
					y: event.clientY,
					target: directoryTarget ? {
						kind: "dir",
						path: root
					} : { kind: "empty" }
				});
				probeClipboardContents();
			};
			/** Paste an image from the system clipboard into `dest` (saved as a file). */
			const pasteImageInto = (dest) => {
				setMenu(null);
				(async () => {
					try {
						if (typeof navigator.clipboard === "undefined" || typeof navigator.clipboard.read !== "function") {
							alertDialog(t("clipboardUnsupported"));
							return;
						}
						const items = await navigator.clipboard.read();
						const imageType = items.map((item) => item.types.find((type) => type.startsWith("image/"))).find((type) => type !== void 0);
						if (imageType === void 0) {
							alertDialog(t("clipboardNoImage"));
							return;
						}
						const item = items.find((entry) => entry.types.includes(imageType));
						if (item === void 0) return;
						const blob = await item.getType(imageType);
						runUpload([{
							name: "image",
							blob,
							mime: imageType
						}], dest);
					} catch (cause) {
						reportError(cause);
					}
				})();
			};
			/** Keep image clipboard compatibility, while regular files use global chunk tasks. */
			const runUpload = (items, dest) => {
				setMenu(null);
				if (items.length === 0) return;
				const images = items.filter((item) => item.mime !== void 0);
				const filesToUpload = items.filter((item) => item.mime === void 0);
				for (const item of images) blobToDataUrl(item.blob).then((dataUrl) => callFiles("saveImage", {
					sessionId,
					parent: dest,
					name: item.name,
					mime: item.mime,
					data: dataUrl.slice(dataUrl.indexOf(",") + 1)
				})).then(() => refreshDirContents(dest)).catch(reportError);
				for (const item of filesToUpload) {
					const abort = new AbortController();
					let paused = false;
					let cancelRequested = false;
					let pauseResolver;
					let uploadId;
					const waitIfPaused = async () => {
						if (!paused || cancelRequested) return;
						await new Promise((resolve) => {
							pauseResolver = resolve;
						});
						pauseResolver = void 0;
					};
					const wakePaused = () => {
						const resolve = pauseResolver;
						pauseResolver = void 0;
						resolve?.();
					};
					const controller = {
						start: async (task) => {
							const started = await callFiles("uploadStart", {
								sessionId,
								parent: dest,
								name: item.name,
								size: item.blob.size
							});
							uploadId = String(started.uploadId ?? "");
							if (uploadId === "") throw new Error("uploadStart returned no uploadId");
							const currentUploadId = uploadId;
							if (cancelRequested) {
								await callFiles("uploadCancel", {
									sessionId,
									uploadId: currentUploadId
								});
								cancelRequested = true;
								return;
							}
							const chunkSize = 1048576;
							for (let offset = task.transferredBytes; offset < item.blob.size; offset += chunkSize) {
								await waitIfPaused();
								if (cancelRequested) return;
								const chunk = item.blob.slice(offset, Math.min(offset + chunkSize, item.blob.size));
								const response = await fetch(`/wb-files/uploadChunk?sessionId=${encodeURIComponent(sessionId ?? "")}&uploadId=${encodeURIComponent(currentUploadId)}&offset=${offset}`, {
									method: "POST",
									body: chunk,
									signal: abort.signal
								});
								const result = await response.json();
								if (!response.ok || result.ok !== true) throw new Error(result.error?.message ?? "upload chunk failed");
								updateTask(task.id, { transferredBytes: Math.min(offset + chunk.size, item.blob.size) });
							}
							if (cancelRequested) return;
							await callFiles("uploadComplete", {
								sessionId,
								uploadId: currentUploadId,
								size: item.blob.size
							});
							if (!cancelRequested) {
								updateTask(task.id, { status: "completed" });
								refreshDirContents(dest);
							}
						},
						pause: () => {
							paused = true;
						},
						resume: () => {
							paused = false;
							wakePaused();
						},
						cancel: async () => {
							cancelRequested = true;
							paused = false;
							wakePaused();
							abort.abort();
							if (uploadId !== void 0) await callFiles("uploadCancel", {
								sessionId,
								uploadId
							});
						}
					};
					const fileStamp = item.blob instanceof File ? item.blob.lastModified : 0;
					const dedupeKey = `${sessionId ?? ""}\u0000${dest}\u0000${item.name}\u0000${item.blob.size}\u0000${fileStamp}`;
					if (hasRecentUpload(dedupeKey)) continue;
					startTask(createTransferTask({
						kind: "upload",
						name: item.name,
						sourcePath: item.name,
						targetPath: dest,
						sessionId,
						totalBytes: item.blob.size,
						dedupeKey,
						controller
					}).id).catch((cause) => {
						if (!cancelRequested) reportError(cause);
					});
				}
			};
			/** Import OS files (drag-in or Ctrl+V paste) into `dest` (unique names). */
			const uploadFiles = (files, dest) => {
				const list = Array.from(files).filter((file) => !(file.size === 0 && file.type === ""));
				if (list.length === 0) return;
				runUpload(list.map((file) => ({
					name: file.name !== "" ? file.name : t("fileFallbackName"),
					blob: file
				})), dest);
			};
			/** Download a regular file through the streaming file route. */
			const downloadFile = (path) => {
				setMenu(null);
				const abort = new AbortController();
				let paused = false;
				let cancelRequested = false;
				let cancelled = false;
				let pauseResolver;
				const waitIfPaused = async () => {
					while (paused && true) {
						await new Promise((resolve) => {
							pauseResolver = resolve;
						});
						pauseResolver = void 0;
					}
				};
				const wakePaused = () => {
					const resolve = pauseResolver;
					pauseResolver = void 0;
					resolve?.();
				};
				startTask(createTransferTask({
					kind: "download",
					name: baseNameOf$1(path),
					sourcePath: path,
					targetPath: t("browserDownload"),
					sessionId,
					totalBytes: 0,
					controller: {
						start: async (task) => {
							let writable;
							try {
								const downloadUrl = `/wb-files/download?sessionId=${encodeURIComponent(sessionId ?? "")}&path=${encodeURIComponent(path)}`;
								const savePicker = navigator.showSaveFilePicker;
								if (savePicker === void 0) {
									const anchor = document.createElement("a");
									anchor.href = downloadUrl;
									anchor.download = baseNameOf$1(path);
									anchor.click();
									updateTask(task.id, { status: "completed" });
									return;
								}
								writable = await (await savePicker({ suggestedName: baseNameOf$1(path) })).createWritable();
								const response = await fetch(downloadUrl, { signal: abort.signal });
								if ((response.headers.get("content-type") ?? "").includes("application/json")) {
									const json = await response.json();
									if (json.value?.skipped === true) {
										updateTask(task.id, {
											status: "skipped",
											error: t("symlinkSkipped")
										});
										return;
									}
									throw new Error(json.error?.message ?? t("downloadFailed"));
								}
								if (!response.ok) throw new Error(t("downloadFailed"));
								const length = Number(response.headers.get("content-length") ?? 0);
								if (length > 0) updateTask(task.id, { totalBytes: length });
								if (response.body !== null) {
									const reader = response.body.getReader();
									let transferred = 0;
									for (;;) {
										await waitIfPaused();
										if (cancelRequested) return;
										const part = await reader.read();
										if (part.done) break;
										await writable.write(part.value);
										transferred += part.value.byteLength;
										updateTask(task.id, {
											transferredBytes: transferred,
											...length > 0 ? { totalBytes: length } : {}
										});
									}
									await writable.close();
									if (length === 0) updateTask(task.id, { totalBytes: transferred });
								} else {
									const buffer = await response.arrayBuffer();
									if (cancelRequested) return;
									await writable.write(new Uint8Array(buffer));
									await writable.close();
									updateTask(task.id, {
										totalBytes: buffer.byteLength,
										transferredBytes: buffer.byteLength
									});
								}
								if (cancelRequested) return;
								const anchor = document.createElement("a");
								anchor.download = baseNameOf$1(path);
								anchor.click();
								updateTask(task.id, { status: "completed" });
							} catch (cause) {
								if (writable !== void 0) await writable.abort?.(cause).catch(() => void 0);
								if (abort.signal.aborted || cancelled) return;
								throw cause;
							}
						},
						pause: () => {
							paused = true;
						},
						resume: () => {
							paused = false;
							wakePaused();
						},
						cancel: async () => {
							cancelRequested = true;
							paused = false;
							wakePaused();
							abort.abort();
						}
					}
				}).id).catch((cause) => reportError(cause));
			};
			/** Move an entry dragged inside the tree into `dest` (never overwrites). */
			const moveDropped = (source, dest) => {
				if (source === dest) return;
				(async () => {
					try {
						await callFiles("move", {
							sessionId,
							sources: [source],
							dest
						});
						refreshParentOf(source);
						refreshDirContents(dest);
					} catch (cause) {
						reportError(cause);
					}
				})();
			};
			/** Route a drop: external OS files are imported, internal drags are moved. */
			const handleDrop = (event, dest) => {
				const dt = event.dataTransfer;
				if (dt === null) return;
				if (dt.files !== void 0 && dt.files.length > 0) {
					uploadFiles(dt.files, dest);
					return;
				}
				let source = dt.getData("application/x-dock-files");
				if (source === "") {
					const text = dt.getData("text/plain");
					source = text.startsWith("dock-files:") ? text.slice(11) : "";
				}
				if (source !== "") moveDropped(source, dest);
			};
			/** Delete one entry after a themed confirmation (recursive for directories). */
			const removePath = (path) => {
				setMenu(null);
				confirmDialog(t("confirmDelete", { name: baseNameOf$1(path) }), () => {
					(async () => {
						try {
							await callFiles("remove", {
								sessionId,
								paths: [path]
							});
							setSelected((previous) => previous === path ? null : previous);
							setChildren((previous) => {
								const next = new Map(previous);
								next.delete(path);
								return next;
							});
							setClipboard((previous) => previous?.path === path ? null : previous);
							refreshParentOf(path);
						} catch (cause) {
							reportError(cause);
						}
					})();
				}, {
					confirmLabel: t("delete"),
					danger: true
				});
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
			(0, react.useEffect)(() => {
				const onHeaderAction = (event) => {
					if (event.type === "dock-files:upload") {
						if (root !== null) chooseUpload(root);
					} else if (event.type === "dock-files:refresh") {
						setMenu(null);
						load();
					} else if (event.type === "dock-files:collapse") collapseAll();
					else if (event.type === "dock-files:transfers") openTransferView(ctx.get("workbench"));
				};
				document.addEventListener("dock-files:upload", onHeaderAction);
				document.addEventListener("dock-files:refresh", onHeaderAction);
				document.addEventListener("dock-files:collapse", onHeaderAction);
				document.addEventListener("dock-files:transfers", onHeaderAction);
				return () => {
					document.removeEventListener("dock-files:upload", onHeaderAction);
					document.removeEventListener("dock-files:refresh", onHeaderAction);
					document.removeEventListener("dock-files:collapse", onHeaderAction);
					document.removeEventListener("dock-files:transfers", onHeaderAction);
				};
			}, [root, load]);
			(0, react.useEffect)(() => {
				if (menu === null) return;
				const onKey = (event) => {
					if (event.key === "Escape") setMenu(null);
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [menu]);
			(0, react.useEffect)(() => {
				if (dialog === null) return;
				const onKey = (event) => {
					if (event.key === "Escape") setDialog(null);
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [dialog]);
			(0, react.useEffect)(() => {
				const onPaste = (event) => {
					const el = viewRef.current;
					if (el === null || root === null) return;
					const active = document.activeElement;
					if (active === null || !el.contains(active)) return;
					if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
					const files = event.clipboardData?.files;
					if (files === void 0 || files.length === 0) return;
					event.preventDefault();
					event.stopPropagation();
					uploadFiles(files, pasteDir ?? root);
				};
				window.addEventListener("paste", onPaste);
				return () => window.removeEventListener("paste", onPaste);
			}, [
				pasteDir,
				root,
				sessionId
			]);
			(0, react.useLayoutEffect)(() => {
				const el = menuRef.current;
				if (el === null || menu === null) return;
				const rect = el.getBoundingClientRect();
				if (rect.right > window.innerWidth) el.style.left = `${Math.max(4, window.innerWidth - rect.width - 4)}px`;
				if (rect.bottom > window.innerHeight) el.style.top = `${Math.max(4, window.innerHeight - rect.height - 4)}px`;
			}, [menu]);
			if (error !== null) return (0, react.createElement)("div", { className: "df-state df-state-error" }, warningIcon(14), (0, react.createElement)("span", null, error));
			if (entries === null) return (0, react.createElement)("div", { className: "df-state" }, loading ? loadingIcon(14, "df-spin") : null, (0, react.createElement)("span", null, loading ? t("loading") : t("noSession")));
			/**
			* Guide column for one row: a 10px slot per ancestor level — a vertical
			* segment when that ancestor still has siblings below it, else an empty
			* spacer — plus the bottom connector (L-corner for the last child,
			* vertical segment otherwise). VSCode explorer order; depth-0 rows get no
			* guides (the toolbar is the root).
			*/
			const guideSlots = (depth, ancestors, isLast) => {
				const slots = [];
				for (let level = 0; level < depth; level += 1) slots.push((0, react.createElement)("span", {
					key: `g${level}`,
					className: ancestors[level] ? "df-guide-v" : "df-guide"
				}));
				slots.push((0, react.createElement)("span", {
					key: "c",
					className: isLast ? "df-guide df-guide-corner" : "df-guide-v"
				}, isLast ? treeCorner(10) : null));
				return slots;
			};
			/** Recursively render a level of entries with running indentation. */
			const renderLevel = (list, depth, ancestors) => {
				const rows = [];
				const count = list.length;
				for (let index = 0; index < count; index += 1) {
					const entry = list[index];
					const isLast = index === count - 1;
					const isExpanded = entry.isDir && expanded.has(entry.path);
					const isCut = clipboard?.mode === "cut" && clipboard.path === entry.path;
					const isRenaming = renaming !== null && renaming.path === entry.path;
					const rowClass = [
						"df-row",
						selected === entry.path ? "df-row-selected" : "",
						entry.hidden ? "df-hidden" : "",
						isCut ? "df-cut" : "",
						dragSource === entry.path ? "df-dragging" : "",
						dragOver === entry.path ? "df-drop-target" : ""
					].filter(Boolean).join(" ");
					rows.push((0, react.createElement)("div", {
						key: entry.path,
						className: rowClass,
						title: entry.path,
						draggable: !isRenaming,
						onClick: isRenaming ? void 0 : () => {
							if (entry.isDir) setPasteDir(entry.path);
							toggle(entry);
						},
						onContextMenu: (event) => {
							event.preventDefault();
							event.stopPropagation();
							setSelected(entry.path);
							if (entry.isDir) setPasteDir(entry.path);
							setMenu({
								x: event.clientX,
								y: event.clientY,
								target: {
									kind: entry.isDir ? "dir" : "file",
									path: entry.path
								}
							});
							if (entry.isDir) probeClipboardContents();
						},
						onDragStart: (event) => {
							const dt = event.dataTransfer;
							if (dt === null) return;
							dt.setData("application/x-dock-files", entry.path);
							dt.setData("text/plain", `dock-files:${entry.path}`);
							dt.effectAllowed = "move";
							setDragSource(entry.path);
						},
						onDragEnd: () => {
							setDragSource(null);
							setDragOver(null);
						},
						onDragEnter: (event) => {
							if (dragSource === entry.path) return;
							event.preventDefault();
							setDragOver(entry.path);
						},
						onDragOver: (event) => {
							if (dragSource === entry.path) return;
							event.preventDefault();
							if (event.dataTransfer !== null) event.dataTransfer.dropEffect = event.dataTransfer.files.length > 0 ? "copy" : "move";
						},
						onDragLeave: () => setDragOver((previous) => previous === entry.path ? null : previous),
						onDrop: (event) => {
							event.preventDefault();
							event.stopPropagation();
							setDragOver(null);
							if (dragSource === entry.path) return;
							const dest = entry.isDir ? entry.path : parentPathOf(entry.path);
							if (dest !== null) handleDrop(event, dest);
						}
					}, ...depth > 0 ? guideSlots(depth, ancestors, isLast) : [], (0, react.createElement)("span", { className: entry.isDir ? `df-arrow${isExpanded ? " df-arrow-open" : ""}` : "df-arrow df-arrow-empty" }, entry.isDir ? (0, react.createElement)("span", { className: "df-arrow-ico" }, treeArrow(10)) : null), (0, react.createElement)("span", { className: "df-type" }, entry.isDir ? folderIcon(isExpanded) : fileIcon(entry.name, files?.iconFor(entry.name), files?.fallbackIcon())), isRenaming ? (0, react.createElement)("input", {
						key: "rename",
						className: "df-rename-input",
						value: renaming.value,
						autoFocus: true,
						onFocus: (event) => {
							const el = event.target;
							const dot = el.value.lastIndexOf(".");
							el.setSelectionRange(0, dot > 0 ? dot : el.value.length);
						},
						onChange: (event) => {
							setRenaming({
								path: entry.path,
								value: event.target.value
							});
						},
						onKeyDown: (event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								commitRename();
							} else if (event.key === "Escape") cancelRename();
						},
						onBlur: commitRename,
						onClick: (event) => event.stopPropagation(),
						onDoubleClick: (event) => event.stopPropagation(),
						onContextMenu: (event) => event.stopPropagation()
					}) : (0, react.createElement)("span", { className: "df-name" }, entry.name), (0, react.createElement)("span", { className: "df-row-actions" }, entry.isDir ? (0, react.createElement)("button", {
						className: "df-row-action",
						title: t("refresh"),
						onClick: (event) => {
							event.stopPropagation();
							refreshDir(entry.path);
						}
					}, refreshIcon(12)) : null, (0, react.createElement)("button", {
						className: "df-row-action",
						title: t("copyPath"),
						onClick: (event) => {
							event.stopPropagation();
							copyPath(entry.path);
						}
					}, copyIcon(12)))));
					if (isExpanded) {
						const kids = children.get(entry.path);
						if (kids === void 0) rows.push((0, react.createElement)("div", {
							key: `${entry.path}:loading`,
							className: "df-loading-row"
						}, ...guideSlots(depth + 1, [...ancestors, !isLast], false), (0, react.createElement)("span", { className: "df-loading-ico" }, loadingIcon(10, "df-spin"))));
						else if (kids.length > 0) rows.push(...renderLevel(kids, depth + 1, [...ancestors, !isLast]));
					}
				}
				return rows;
			};
			const menuItem = (key, icon, label, action, disabled = false) => (0, react.createElement)("div", {
				key,
				className: `df-context-menu-item${disabled ? " df-context-menu-item-disabled" : ""}`,
				...disabled || action === void 0 ? {} : { onClick: action }
			}, icon, (0, react.createElement)("span", null, label));
			const separator = (key) => (0, react.createElement)("div", {
				key,
				className: "df-context-menu-sep"
			});
			const buildMenuItems = () => {
				if (menu === null) return [];
				const target = menu.target;
				const pasteOrUploadItem = (dest) => clipboard !== null ? menuItem("paste", pasteIcon(13), t("pasteWithName", { name: baseNameOf$1(clipboard.path) }), () => pasteInto(dest)) : menuItem("upload", uploadIcon(13), t("upload"), () => chooseUpload(dest));
				const pasteImageItem = (dest) => imageProbe === "has" ? [menuItem("paste-image", imageIcon(13), t("pasteImage"), () => pasteImageInto(dest))] : [];
				if (target.kind === "empty") {
					if (root === null) return [];
					return [
						menuItem("new-file", plusIcon(13), t("newFile"), () => startCreate("file", root)),
						menuItem("new-dir", newFolderIcon(13), t("newFolder"), () => startCreate("dir", root)),
						separator("s1"),
						pasteOrUploadItem(root),
						...pasteImageItem(root),
						separator("s2"),
						menuItem("refresh", refreshIcon(13), t("refresh"), () => void load())
					];
				}
				const path = target.path;
				if (target.kind === "dir") return [
					menuItem("new-file", plusIcon(13), t("newFile"), () => startCreate("file", path)),
					menuItem("new-dir", newFolderIcon(13), t("newFolder"), () => startCreate("dir", path)),
					separator("s1"),
					menuItem("refresh", refreshIcon(13), t("refresh"), () => refreshDir(path)),
					...path === root ? [] : [menuItem("rename", editIcon(13), t("rename"), () => beginRename(path))],
					menuItem("copy", copyIcon(13), t("copy"), () => setClip("copy", path)),
					menuItem("cut", cutIcon(13), t("cut"), () => setClip("cut", path)),
					pasteOrUploadItem(path),
					...pasteImageItem(path),
					separator("s2"),
					...path === root ? [] : [menuItem("delete", trashIcon(13), t("delete"), () => removePath(path))],
					menuItem("copy-path", copyIcon(13), t("copyPath"), () => copyPath(path))
				];
				return [
					menuItem("open", openIcon(13), t("open"), () => openFile(path)),
					menuItem("download", openIcon(13), t("download"), () => downloadFile(path)),
					separator("s1"),
					menuItem("rename", editIcon(13), t("rename"), () => beginRename(path)),
					menuItem("copy", copyIcon(13), t("copy"), () => setClip("copy", path)),
					menuItem("cut", cutIcon(13), t("cut"), () => setClip("cut", path)),
					separator("s2"),
					menuItem("delete", trashIcon(13), t("delete"), () => removePath(path)),
					menuItem("copy-path", copyIcon(13), t("copyPath"), () => copyPath(path))
				];
			};
			const menuEl = menu === null ? null : (0, react.createElement)(react.Fragment, null, (0, react.createElement)("div", {
				className: "df-context-backdrop",
				onMouseDown: () => setMenu(null),
				onContextMenu: (event) => event.preventDefault()
			}), (0, react.createElement)("div", {
				ref: menuRef,
				className: "df-context-menu",
				style: {
					left: menu.x,
					top: menu.y
				},
				onMouseDown: (event) => event.stopPropagation(),
				onContextMenu: (event) => event.preventDefault()
			}, ...buildMenuItems()));
			const dialogEl = dialog === null ? null : (0, react_dom.createPortal)((0, react.createElement)("div", {
				className: "df-dialog-backdrop",
				onMouseDown: () => setDialog(null),
				onContextMenu: (event) => event.preventDefault()
			}, (0, react.createElement)("div", {
				className: "df-dialog",
				role: "dialog",
				"aria-modal": true,
				onMouseDown: (event) => event.stopPropagation()
			}, (0, react.createElement)("div", { className: "df-dialog-body" }, dialog.message), (0, react.createElement)("div", { className: "df-dialog-actions" }, dialog.kind === "confirm" ? [(0, react.createElement)("button", {
				key: "cancel",
				className: "df-dialog-btn",
				onClick: () => setDialog(null)
			}, t("cancel")), (0, react.createElement)("button", {
				key: "confirm",
				className: `df-dialog-btn df-dialog-btn-primary${dialog.danger === true ? " df-dialog-btn-danger" : ""}`,
				autoFocus: true,
				onClick: () => {
					const action = dialog.onConfirm;
					setDialog(null);
					action?.();
				}
			}, dialog.confirmLabel !== void 0 ? t(dialog.confirmLabel) : t("ok"))] : [(0, react.createElement)("button", {
				key: "ok",
				className: "df-dialog-btn df-dialog-btn-primary",
				autoFocus: true,
				onClick: () => setDialog(null)
			}, t("ok"))]))), document.body);
			const rows = renderLevel(entries, 0, []);
			return (0, react.createElement)("div", {
				ref: viewRef,
				className: "df-view",
				tabIndex: 0,
				onMouseDown: (event) => {
					const target = event.target;
					if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
					if (document.activeElement !== viewRef.current) viewRef.current?.focus();
				}
			}, (0, react.createElement)("div", {
				className: "df-pathbar",
				title: root ?? void 0,
				onClick: () => {
					setMenu(null);
					load();
				},
				onContextMenu: (event) => openRootContextMenu(event, true)
			}, folderIcon(true, 13), (0, react.createElement)("span", null, root ?? "…")), (0, react.createElement)("div", {
				className: "df-shell-progress",
				role: "progressbar",
				"aria-valuemin": 0,
				"aria-valuemax": 100,
				"aria-valuenow": totalTransferProgress,
				title: `${totalTransferProgress}%`
			}, (0, react.createElement)("div", {
				className: "df-shell-progress-fill",
				style: { width: `${totalTransferProgress}%` }
			})), (0, react.createElement)("input", {
				ref: uploadInputRef,
				type: "file",
				multiple: true,
				hidden: true,
				onChange: onUploadInputChange
			}), (0, react.createElement)("div", {
				className: `df-tree${dragOver === root && root !== null ? " df-drop-target" : ""}`,
				onContextMenu: (event) => {
					if (event.target !== event.currentTarget) return;
					event.preventDefault();
					setPasteDir(null);
					setMenu({
						x: event.clientX,
						y: event.clientY,
						target: { kind: "empty" }
					});
					probeClipboardContents();
				},
				onDragEnter: (event) => {
					if (event.target !== event.currentTarget || root === null) return;
					event.preventDefault();
					setDragOver(root);
				},
				onDragOver: (event) => {
					if (event.target !== event.currentTarget) return;
					event.preventDefault();
					if (event.dataTransfer !== null) event.dataTransfer.dropEffect = event.dataTransfer.files.length > 0 ? "copy" : "move";
				},
				onDragLeave: (event) => {
					if (event.target !== event.currentTarget) return;
					setDragOver((previous) => previous === root ? null : previous);
				},
				onDrop: (event) => {
					if (event.target !== event.currentTarget || root === null) return;
					event.preventDefault();
					setDragOver(null);
					handleDrop(event, root);
				}
			}, ...entries.length === 0 ? [(0, react.createElement)("div", {
				key: "empty",
				className: "df-empty",
				onContextMenu: (event) => {
					event.preventDefault();
					event.stopPropagation();
					setPasteDir(null);
					setMenu({
						x: event.clientX,
						y: event.clientY,
						target: { kind: "empty" }
					});
					probeClipboardContents();
				},
				onDragEnter: (event) => {
					event.preventDefault();
					event.stopPropagation();
					if (root !== null) setDragOver(root);
				},
				onDragOver: (event) => {
					event.preventDefault();
					event.stopPropagation();
					if (event.dataTransfer !== null) event.dataTransfer.dropEffect = event.dataTransfer.files.length > 0 ? "copy" : "move";
				},
				onDrop: (event) => {
					event.preventDefault();
					event.stopPropagation();
					setDragOver(null);
					if (root !== null) handleDrop(event, root);
				}
			}, t("emptyDir"))] : rows, (0, react.createElement)("div", {
				className: "df-root-spacer",
				onContextMenu: (event) => openRootContextMenu(event),
				onDragEnter: (event) => {
					event.preventDefault();
					if (root !== null) setDragOver(root);
				},
				onDragOver: (event) => {
					event.preventDefault();
					if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "copy";
				},
				onDragLeave: () => setDragOver((previous) => previous === root ? null : previous),
				onDrop: (event) => {
					event.preventDefault();
					setDragOver(null);
					if (root !== null) handleDrop(event, root);
				}
			})), menuEl !== null ? (0, react_dom.createPortal)(menuEl, document.body) : null, dialogEl !== null ? (0, react_dom.createPortal)(dialogEl, document.body) : null);
		}
		//#endregion
		//#region src/client/styles.ts
		/**
		* dock-files explorer styles (VSCode-style modern tree): toolbar, tree guide
		* lines, row hover/selected feedback, hover actions, the file-type tint and
		* the context menu — hover/active states and animations cannot be expressed
		* with inline styles, so they are injected once as a
		* <style data-plugin="dock-files"> tag (same pattern as the dock base).
		*
		* Colours use DSH theme tokens with light-theme fallbacks (the dock-family
		* convention); the per-type file tints live in icons.ts.
		*/
		const CSS = `
/* ── View shell ── */
.df-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  font-size: 13px;
  color: var(--dsw-alias-label-primary, #1f2328);
  overflow: hidden;
}

/* ── Fixed workspace path row (the shell title-row actions sit above it) ── */
.df-pathbar {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
  padding: 3px 6px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #d8dbe0);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  flex: none;
}
.df-pathbar svg { flex: none; color: var(--dsw-alias-label-secondary, #656d76); }
.df-pathbar > span { overflow: hidden; text-overflow: ellipsis; }
.df-pathbar:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.10)); }
/* ── Fixed Files title-row actions and progress ── */
.df-shell-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  min-width: 96px;
  margin-left: auto;
}
.df-shell-action-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}
.df-shell-progress {
  width: 100%;
  height: 1px;
  overflow: hidden;
}
.df-shell-progress-fill {
  height: 1px;
  background: #0969da;
  transition: width 0.12s linear;
}
.df-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #656d76);
  cursor: pointer;
  flex-shrink: 0;
}
.df-icon-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));
  color: var(--dsw-alias-label-primary, #1f2328);
}
.df-icon-btn:disabled { opacity: 0.45; cursor: default; }
.df-download-indicator {
  position: relative;
  display: inline-flex;
  width: 24px;
  height: 24px;
  align-items: center;
  justify-content: center;
  flex: none;
}
.df-download-spinner {
  display: block;
  width: 17px;
  height: 17px;
  box-sizing: border-box;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  will-change: transform;
}
.df-download-count {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
}
/* ── Tree ── */
.df-tree {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 0 8px;
}

/* One row: [guides][arrow][type icon][name][hover actions]. The transparent
   left border becomes the VSCode-style selection accent bar. */
.df-row {
  display: flex;
  align-items: center;
  height: 24px;
  box-sizing: border-box;
  padding-right: 4px;
  cursor: pointer;
  white-space: nowrap;
  border-left: 2px solid transparent;
  animation: df-row-in 0.12s ease-out;
}
@keyframes df-row-in {
  from { opacity: 0; transform: translateY(-2px); }
  to { opacity: 1; transform: none; }
}
.df-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.10)); }
.df-row-selected,
.df-row-selected:hover {
  background: var(--dsw-alias-interactive-bg-hover-accent, rgba(9, 105, 218, 0.12));
  border-left-color: var(--dsw-alias-interactive-bg-hover-accent, rgba(9, 105, 218, 0.55));
}
.df-hidden .df-name { opacity: 0.6; }

/* Guide lines: 10px per level; the corner glyph inherits the line colour. */
.df-guide {
  width: 10px;
  height: 24px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  color: var(--dsw-alias-border-l2, #d8dbe0);
}
/* The corner glyph's vertical stroke must line up with the segment above,
   so it is top-aligned instead of centered. */
.df-guide-corner { align-items: flex-start; }
.df-guide-v {
  width: 10px;
  height: 24px;
  flex: none;
  box-sizing: border-box;
  border-left: 1px solid var(--dsw-alias-border-l2, #d8dbe0);
}

/* Expand arrow (rotates 90° on open) + type icon + name. */
.df-arrow {
  width: 12px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-secondary, #656d76);
}
.df-arrow-ico { display: inline-flex; transition: transform 0.12s ease; }
.df-arrow-open .df-arrow-ico { transform: rotate(90deg); }
.df-type {
  width: 18px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.df-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-left: 2px;
}

/* Hover action buttons (copy path; refresh for directories). */
.df-row-actions {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding-left: 4px;
  opacity: 0;
  transition: opacity 0.1s ease;
}
.df-row:hover .df-row-actions,
.df-row-selected .df-row-actions { opacity: 1; }
.df-row-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #656d76);
  cursor: pointer;
}
.df-row-action:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.14));
  color: var(--dsw-alias-label-primary, #1f2328);
}

/* Spinner row under an expanding directory. */
.df-loading-row {
  display: flex;
  align-items: center;
  height: 24px;
}
.df-loading-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
  color: var(--dsw-alias-label-secondary, #656d76);
}
.df-spin { animation: df-rotate 0.8s linear infinite; }
@keyframes df-rotate { to { transform: rotate(360deg); } }

/* ── States ── */
.df-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #656d76);
}
.df-state svg { flex: none; }
.df-state-error { color: #d1242f; }
.df-empty {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #656d76);
}
.df-root-spacer {
  height: 20px;
  flex: none;
  margin-top: 4px;
}

/* ── Context menu (portaled to <body>, above the dock shell) ── */
.df-context-backdrop { position: fixed; inset: 0; z-index: 999; }
.df-context-menu {
  position: fixed;
  z-index: 1000;
  pointer-events: auto;
  min-width: 160px;
  padding: 4px;
  border-radius: 8px;
  font-size: 13px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #d8dbe0);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  color: var(--dsw-alias-label-primary, #1f2328);
  animation: df-menu-in 0.1s ease-out;
}
@keyframes df-menu-in {
  from { opacity: 0; transform: scale(0.97) translateY(-2px); }
  to { opacity: 1; transform: none; }
}
.df-context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
}
.df-context-menu-item svg { flex: none; color: var(--dsw-alias-label-secondary, #656d76); }
.df-context-menu-item:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12)); }
.df-context-menu-item:hover svg { color: var(--dsw-alias-label-primary, #1f2328); }
.df-context-menu-item:active { background: var(--dsw-alias-interactive-bg-hover-accent, rgba(90, 120, 255, 0.22)); }
/* Disabled item (paste with an empty clipboard): muted, no hover. */
.df-context-menu-item-disabled { opacity: 0.45; cursor: default; }
.df-context-menu-item-disabled:hover { background: transparent; }
.df-context-menu-item-disabled:hover svg { color: var(--dsw-alias-label-secondary, #656d76); }
/* Separator line between menu groups. */
.df-context-menu-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--dsw-alias-border-l2, #d8dbe0);
}

/* ── Inline rename input (replaces the row's name span) ── */
.df-rename-input {
  flex: 1;
  min-width: 0;
  height: 20px;
  margin: 0;
  padding: 0 4px;
  box-sizing: border-box;
  font: inherit;
  color: var(--dsw-alias-label-primary, #1f2328);
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border: 1px solid var(--dsw-alias-interactive-bg-hover-accent, rgba(9, 105, 218, 0.55));
  border-radius: 4px;
  outline: none;
}

/* ── Cut items stay dimmed until pasted ── */
.df-cut .df-type,
.df-cut .df-name { opacity: 0.45; }

/* ── Drag & drop (internal move / OS file import) ── */
.df-row.df-dragging { opacity: 0.45; }
.df-row.df-drop-target,
.df-row.df-drop-target:hover {
  background: var(--dsw-alias-interactive-bg-hover-accent, rgba(9, 105, 218, 0.15));
}
.df-tree.df-drop-target {
  box-shadow: inset 0 0 0 1.5px var(--dsw-alias-interactive-bg-hover-accent, rgba(9, 105, 218, 0.55));
  border-radius: 6px;
}

/* ── Focusable panel (Ctrl+V local-file paste) — no visible focus ring ── */
.df-view:focus,
.df-view:focus-visible { outline: none; }

/* ── Upload progress: fixed below the toolbar; empty stays transparent ── */
.df-progress {
  height: 1px;
  overflow: hidden;
}
.df-progress-fill {
  height: 1px;
  background: #0969da;
  transition: width 0.12s linear;
}

/* ── Transfer center ── */
.df-transfer-view { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--dsw-alias-label-primary, #1f2328); font-size: 12px; }
.df-transfer-header { display: flex; align-items: center; gap: 10px; padding: 0 0 8px; border-bottom: 1px solid var(--dsw-alias-border-l2, #d8dbe0); flex: none; }
.df-transfer-title { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.df-transfer-summary { flex: 1; color: var(--dsw-alias-label-secondary, #656d76); }
.df-transfer-clear, .df-transfer-action { border: 0; border-radius: 5px; background: transparent; color: var(--dsw-alias-label-secondary, #656d76); cursor: pointer; font-size: 11px; padding: 4px 6px; }
.df-transfer-clear:hover, .df-transfer-action:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12)); color: var(--dsw-alias-label-primary, #1f2328); }
.df-transfer-list { min-height: 0; overflow: auto; padding-top: 4px; }
.df-transfer-empty { padding: 16px 8px; color: var(--dsw-alias-label-secondary, #656d76); text-align: center; }
.df-transfer-row {
  display: grid;
  grid-template-columns: minmax(110px, 1fr) minmax(140px, 1.3fr) minmax(130px, 1fr) auto;
  gap: 10px;
  align-items: center;
  margin: 4px 2px;
  padding: 9px 10px;
  border: 1px solid var(--dsw-alias-border-l2, #d8dbe0);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.34));
}
.df-transfer-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.08)); }
.df-transfer-main, .df-transfer-paths, .df-transfer-progress { min-width: 0; }
.df-transfer-name, .df-transfer-path-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
}
.df-transfer-name { font-weight: 600; }
.df-transfer-path-text { flex: 1 1 0; }
.df-transfer-kind, .df-transfer-progress > span { color: var(--dsw-alias-label-secondary, #656d76); font-size: 11px; }
.df-transfer-paths { display: flex; gap: 4px; color: var(--dsw-alias-label-secondary, #656d76); }
.df-transfer-path-arrow { flex: none; }
.df-transfer-progress-track { height: 6px; overflow: hidden; border-radius: 4px; background: var(--dsw-alias-border-l2, #d8dbe0); }
.df-transfer-progress-fill { height: 100%; border-radius: inherit; background: #0969da; transition: width .15s ease; }
.df-transfer-progress-paused { background: #8a919b; }
.df-transfer-progress-queued { background: #6ea8e5; }
.df-transfer-status-badge {
  display: none;
  justify-self: start;
  padding: 3px 8px;
  border-radius: 999px;
  color: var(--dsw-alias-label-secondary, #656d76);
  background: var(--dsw-alias-border-l2, #eef0f2);
  font-size: 11px;
  white-space: nowrap;
}
.df-transfer-row-completed .df-transfer-progress,
.df-transfer-row-failed .df-transfer-progress,
.df-transfer-row-cancelled .df-transfer-progress,
.df-transfer-row-skipped .df-transfer-progress { display: none; }
.df-transfer-row-completed .df-transfer-status-badge,
.df-transfer-row-failed .df-transfer-status-badge,
.df-transfer-row-cancelled .df-transfer-status-badge,
.df-transfer-row-skipped .df-transfer-status-badge { display: inline-flex; }
.df-transfer-status-completed { color: #218739; background: rgba(46, 160, 67, 0.12); }
.df-transfer-status-failed { color: #cf222e; background: rgba(207, 34, 46, 0.12); }
.df-transfer-status-cancelled, .df-transfer-status-skipped { color: #6e7781; background: rgba(110, 119, 129, 0.14); }
.df-transfer-actions { display: flex; gap: 2px; }
.df-transfer-error { grid-column: 1 / -1; overflow: hidden; color: #d1242f; text-overflow: ellipsis; white-space: nowrap; }
.df-transfer-status { display: inline-flex; align-items: center; gap: 5px; border: 0; background: transparent; color: var(--dsw-alias-label-secondary, #656d76); cursor: pointer; font-size: 11px; padding: 2px 6px; }
.df-transfer-status:hover { color: var(--dsw-alias-label-primary, #1f2328); }

/* ── Dialog (themed replacement for the native confirm/alert) ── */
.df-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}
/* The card is a flex child of the backdrop: centered by it and painted
   above its background inside the backdrop's stacking context. */
.df-dialog {
  min-width: 260px;
  max-width: 420px;
  padding: 14px 16px;
  border-radius: 10px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary, #1f2328);
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  border: 1px solid var(--dsw-alias-border-l2, #d8dbe0);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
  animation: df-dialog-in 0.12s ease-out;
}
@keyframes df-dialog-in {
  from { opacity: 0; transform: scale(0.96) translateY(4px); }
  to { opacity: 1; transform: none; }
}
.df-dialog-body {
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.df-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.df-dialog-btn {
  padding: 5px 14px;
  border: 1px solid var(--dsw-alias-border-l2, #d8dbe0);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2, #ffffff);
  color: var(--dsw-alias-label-primary, #1f2328);
  font-size: 12px;
  cursor: pointer;
}
.df-dialog-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));
}
.df-dialog-btn-primary {
  border-color: transparent;
  background: #0969da;
  color: #ffffff;
}
.df-dialog-btn-primary:hover { background: #0a6ee0; }
.df-dialog-btn-danger { background: #d1242f; }
.df-dialog-btn-danger:hover { background: #b01e27; }
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
		/**
		* Client half of dock-files: the file-domain host. It owns the "file"
		* concept (the explorer panel browses files) and dispatches opening a file
		* to registered file viewers (e.g. dock-editor) through the workbench's
		* editor-area carrier. It no longer renders file content itself — viewers
		* do. Type-only imports only; all runtime collaboration goes through
		* ctx.workbench / ctx.files method calls.
		*/
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
			const fileIcons = [];
			let version = 0;
			const listeners = /* @__PURE__ */ new Set();
			const bump = () => {
				version += 1;
				for (const listener of listeners) listener();
			};
			const open = (path, options) => {
				const matched = resolveViewer(path);
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
			/** The viewer a path dispatches to (extension match, then the default). */
			const resolveViewer = (path) => {
				const ext = extOfPath(path);
				return [...viewers.values()].find((v) => v.exts?.includes(ext)) ?? [...viewers.values()].find((v) => v.default === true);
			};
			const canOpen = (path) => resolveViewer(path) !== void 0;
			const registerFileViewer = (def) => {
				viewers.set(def.id, def);
				bump();
				return () => {
					if (viewers.get(def.id) !== def) return;
					viewers.delete(def.id);
					bump();
				};
			};
			const registerFileIcon = (def) => {
				fileIcons.push(def);
				bump();
				return () => {
					const at = fileIcons.indexOf(def);
					if (at !== -1) {
						fileIcons.splice(at, 1);
						bump();
					}
				};
			};
			const iconFor = (name) => {
				const ext = extOfPath(name);
				return [...viewers.values()].find((v) => v.exts?.includes(ext) && v.icon !== void 0)?.icon ?? fileIcons.find((def) => def.exts.includes(ext))?.icon;
			};
			const fallbackIcon = () => [...viewers.values()].find((v) => v.default === true && v.icon !== void 0)?.icon;
			const subscribe = (listener) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			};
			const getIconVersion = () => version;
			return {
				open,
				canOpen,
				registerFileViewer,
				registerFileIcon,
				iconFor,
				fallbackIcon,
				subscribe,
				getIconVersion
			};
		}
		/** POST /wb-files/probe: stat an absolute path (existence + directory flag). */
		async function probePath(path) {
			const json = await (await fetch("/wb-files/probe", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ path })
			})).json();
			if (json.ok !== true || json.value === void 0) throw new Error(json.error?.message ?? "probe failed");
			return json.value;
		}
		/**
		* Route conversation file paths into the workbench file domain. The chat
		* view opens clicked paths (prose mentions, tool rows, produced files)
		* through `workspaces.openPath` → host `openPath` → the OS default
		* application (xdg-open / open / Invoke-Item), which fails on hosts without
		* a desktop association ("path open failed: Command failed: xdg-open …").
		* When the target exists as a regular file and a registered viewer can open
		* it, dispatch through `workbench.openPath` (the file-domain handler) so the
		* matching tool opens it; folders, missing paths and unviewable types keep
		* the native opener. Returns the disposer that restores the original method.
		*/
		function bridgeChatOpens(ctx, workbench, files, workspaces) {
			const nativeOpen = workspaces.openPath.bind(workspaces);
			workspaces.openPath = async (path) => {
				try {
					const probe = await probePath(path);
					if (probe.exists && !probe.isDir && files.canOpen(path)) {
						workbench.openPath(path);
						return;
					}
				} catch {}
				await nativeOpen(path);
			};
			return () => {
				workspaces.openPath = nativeOpen;
			};
		}
		function dispatchHeaderAction(name) {
			document.dispatchEvent(new Event(`dock-files:${name}`));
		}
		const TERMINAL_TRANSFER_STATUSES = /* @__PURE__ */ new Set([
			"completed",
			"failed",
			"cancelled",
			"skipped"
		]);
		function DownloadIndicator({ count }) {
			const [rotation, setRotation] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				if (count === 0) return;
				const timer = window.setInterval(() => {
					setRotation((value) => (value + 12) % 360);
				}, 50);
				return () => window.clearInterval(timer);
			}, [count]);
			if (count === 0) return transferIcon(14);
			return (0, react.createElement)("span", {
				className: "df-download-indicator",
				"aria-label": `${count} 个下载任务`
			}, (0, react.createElement)("span", {
				className: "df-download-spinner",
				"aria-hidden": true,
				style: { transform: `rotate(${rotation}deg)` }
			}), (0, react.createElement)("span", { className: "df-download-count" }, count > 9 ? "9+" : String(count)));
		}
		/** Actions rendered in the dock shell's fixed Files title row. */
		function FilesHeaderActions(_props) {
			const activeTransferCount = (0, react.useSyncExternalStore)(subscribe, getSnapshot).tasks.filter((task) => !TERMINAL_TRANSFER_STATUSES.has(task.status)).length;
			const button = (key, title, icon) => (0, react.createElement)("button", {
				key,
				className: "df-icon-btn",
				title,
				onClick: () => dispatchHeaderAction(key)
			}, icon);
			return (0, react.createElement)("div", { className: "df-shell-actions" }, (0, react.createElement)("div", { className: "df-shell-action-row" }, button("upload", "上传", uploadIcon(14)), button("refresh", "刷新", refreshIcon(14)), button("collapse", "折叠全部", collapseAllIcon(14)), button("transfers", activeTransferCount > 0 ? `传输任务 ${activeTransferCount > 9 ? "9+" : activeTransferCount}` : "打开传输中心", (0, react.createElement)(DownloadIndicator, { count: activeTransferCount }))));
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
			ctx.effect(() => {
				let restore;
				let off;
				const install = (ws) => {
					if (restore !== void 0) return;
					off?.();
					restore = bridgeChatOpens(ctx, workbench, files, ws);
				};
				const existing = ctx.get("workspaces");
				if (existing !== void 0) install(existing);
				else off = ctx.on("internal/service", (...args) => {
					if (args[0] !== "workspaces") return;
					install(args[1]);
				});
				return () => {
					off?.();
					restore?.();
				};
			}, "dock-files: chat open-path bridge");
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
				component: ExplorerView,
				headerComponent: FilesHeaderActions
			}), "dock-files: files panel");
			ctx.effect(() => workbench.registerEditorView({
				id: "transfers",
				title: "Transfers",
				icon: FOLDER_ICON,
				order: 20,
				component: TransferView
			}), "dock-files: transfers view");
			ctx.effect(() => workbench.registerStatusBarItem({
				id: "transfers",
				order: 20,
				component: TransferStatusBar
			}), "dock-files: transfers status");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.openTransferView = openTransferView;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map