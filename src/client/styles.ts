/**
 * desk-files shell styles: the file-tree context menu needs :hover/:active
 * feedback, which inline styles cannot express — injected once as a
 * <style data-plugin="desk-files"> tag (same pattern as the desk base).
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
`

export function mountStyles(): () => void {
  const existing = document.querySelector('style[data-plugin="desk-files"]')
  if (existing !== null) existing.remove()
  const style = document.createElement('style')
  style.setAttribute('data-plugin', 'desk-files')
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
