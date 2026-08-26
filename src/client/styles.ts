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
.df-transfer-row { display: grid; grid-template-columns: minmax(110px, 1fr) minmax(140px, 1.3fr) minmax(130px, 1fr) auto; gap: 8px; align-items: center; padding: 8px 4px; border-bottom: 1px solid var(--dsw-alias-border-l2, #d8dbe0); }
.df-transfer-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.08)); }
.df-transfer-main, .df-transfer-paths, .df-transfer-progress { min-width: 0; }
.df-transfer-name, .df-transfer-paths span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.df-transfer-name { font-weight: 600; }
.df-transfer-kind, .df-transfer-progress > span { color: var(--dsw-alias-label-secondary, #656d76); font-size: 11px; }
.df-transfer-paths { display: flex; gap: 4px; color: var(--dsw-alias-label-secondary, #656d76); }
.df-transfer-path-arrow { flex: none; }
.df-transfer-progress-track { height: 4px; overflow: hidden; border-radius: 3px; background: var(--dsw-alias-border-l2, #d8dbe0); }
.df-transfer-progress-fill { height: 100%; border-radius: inherit; background: var(--dsw-alias-interactive-bg-hover-accent, #0969da); transition: width .15s ease; }
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
`

export function mountStyles(): () => void {
  const existing = document.querySelector('style[data-plugin="dock-files"]')
  if (existing !== null) existing.remove()
  const style = document.createElement('style')
  style.setAttribute('data-plugin', 'dock-files')
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
