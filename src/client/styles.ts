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

/* ── Toolbar: root directory + refresh + collapse-all ── */
.df-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 0 6px;
  margin-bottom: 2px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, #d8dbe0);
  flex-shrink: 0;
}
.df-toolbar-name {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
}
.df-toolbar-name svg { flex: none; color: var(--dsw-alias-label-secondary, #656d76); }
.df-toolbar-name > span { overflow: hidden; text-overflow: ellipsis; }
.df-toolbar-name:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.10)); }
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
.df-icon-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 0;
  gap: 1px;
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
