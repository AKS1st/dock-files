/**
 * Pure file browser: a lazy recursive directory tree over the active
 * session's working directory (own /wb-files host route). Clicking a file
 * dispatches through the file-domain service (`ctx.files.open`) to a
 * registered file viewer (dock-editor) — this view never renders file
 * content itself.
 *
 * Modern VSCode-style presentation: a toolbar (root directory + refresh +
 * collapse-all), per-type tinted file glyphs, tree guide lines, hover
 * action buttons, a modern context menu and styled states. All glyphs are
 * the vendored harness ic_ds_* icon set (see ./icons.ts).
 */
import { createElement, Fragment, useCallback, useEffect, useSyncExternalStore, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ViewProps } from './contract.ts'
import type { FilesService } from './index'
import {
  chevronUpIcon,
  copyIcon,
  fileIcon,
  folderIcon,
  loadingIcon,
  refreshIcon,
  treeArrow,
  treeCorner,
  warningIcon,
} from './icons'

/** One wire row (host WbFsEntry shape). */
interface FsEntry {
  name: string
  path: string
  isDir: boolean
  hidden: boolean
}

interface ListResponse {
  ok: boolean
  value?: { listing: { path: string; entries: FsEntry[] }; cwd: string }
  error?: { code: string; message: string }
}

/** One open context menu. */
interface MenuState {
  x: number
  y: number
  path: string
  isDir: boolean
}

/** Stable no-op subscription/snapshot for useSyncExternalStore without the files service. */
const NOOP_SUBSCRIBE = (): (() => void) => () => {}
const NOOP_SNAPSHOT = (): number => 0

export function ExplorerView(props: ViewProps): ReactNode {
  const { ctx, sessionId, active } = props
  const files = ctx.get<FilesService>('files')
  // Re-render when a viewer (re)registers with an icon (plugin update / HMR);
  // icons resolve through the files service at render time.
  useSyncExternalStore(files?.subscribe ?? NOOP_SUBSCRIBE, files?.getIconVersion ?? NOOP_SNAPSHOT)
  const [root, setRoot] = useState<string | null>(null)
  const [entries, setEntries] = useState<FsEntry[] | null>(null)
  const [children, setChildren] = useState<Map<string, FsEntry[]>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (path?: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/wb-files/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(path === undefined ? { sessionId } : { sessionId, path }),
      })
      const json = (await response.json()) as ListResponse
      if (json.ok !== true || json.value === undefined) {
        throw new Error(json.error?.message ?? 'list failed')
      }
      setRoot(json.value.listing.path)
      setEntries(json.value.listing.entries)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    // Session/workspace switch: drop the old workspace's directory cache and
    // reload from the new session's working directory.
    setChildren(new Map())
    setExpanded(new Set())
    if (active) void load()
  }, [active, load, sessionId])

  /** Fetch and cache one directory level. */
  const fetchChildren = useCallback(async (path: string): Promise<void> => {
    try {
      const response = await fetch('/wb-files/list', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, path }),
      })
      const json = (await response.json()) as ListResponse
      if (json.ok !== true || json.value === undefined) {
        throw new Error(json.error?.message ?? 'list failed')
      }
      setChildren((previous) => {
        const next = new Map(previous)
        next.set(path, json.value!.listing.entries)
        return next
      })
    } catch {
      // Expansion failure: leave the node collapsed.
      setExpanded((previous) => {
        const dropped = new Set(previous)
        dropped.delete(path)
        return dropped
      })
    }
  }, [sessionId])

  const openFile = (path: string): void => {
    setSelected(path)
    setMenu(null)
    ctx.get<FilesService>('files')?.open(path, { mode: 'floating' })
  }

  /** Reload one directory level (drop the cached children and refetch). */
  const refreshDir = (path: string): void => {
    setMenu(null)
    setChildren((previous) => {
      const next = new Map(previous)
      next.delete(path)
      return next
    })
    void fetchChildren(path)
  }

  const copyPath = (path: string): void => {
    setMenu(null)
    void navigator.clipboard?.writeText(path).catch(() => {})
  }

  /** Collapse every expanded directory (the child cache is kept). */
  const collapseAll = (): void => {
    setMenu(null)
    setExpanded(new Set())
  }

  const toggle = (entry: FsEntry): void => {
    if (!entry.isDir) {
      // Clicking a file opens it directly in an independent floating window
      // (dock-editor only supports standalone-window mode).
      openFile(entry.path)
      return
    }
    const willExpand = !expanded.has(entry.path)
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(entry.path)) {
        next.delete(entry.path)
      } else {
        next.add(entry.path)
      }
      return next
    })
    if (willExpand && !children.has(entry.path)) {
      void fetchChildren(entry.path)
    }
  }

  // Escape dismisses the context menu (backdrop also closes it on click).
  useEffect(() => {
    if (menu === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  if (error !== null) {
    return createElement('div', { className: 'df-state df-state-error' },
      warningIcon(14),
      createElement('span', null, error))
  }
  if (entries === null) {
    return createElement('div', { className: 'df-state' },
      loading ? loadingIcon(14, 'df-spin') : null,
      createElement('span', null, loading ? '加载中…' : '无会话'))
  }

  /**
   * Guide column for one row: a 10px slot per ancestor level — a vertical
   * segment when that ancestor still has siblings below it, else an empty
   * spacer — plus the bottom connector (L-corner for the last child,
   * vertical segment otherwise). VSCode explorer order; depth-0 rows get no
   * guides (the toolbar is the root).
   */
  const guideSlots = (depth: number, ancestors: boolean[], isLast: boolean): ReactNode[] => {
    const slots: ReactNode[] = []
    for (let level = 0; level < depth; level += 1) {
      slots.push(createElement('span', {
        key: `g${level}`,
        className: ancestors[level] ? 'df-guide-v' : 'df-guide',
      }))
    }
    slots.push(createElement('span', {
      key: 'c',
      className: isLast ? 'df-guide df-guide-corner' : 'df-guide-v',
    }, isLast ? treeCorner(10) : null))
    return slots
  }

  /** Recursively render a level of entries with running indentation. */
  const renderLevel = (list: FsEntry[], depth: number, ancestors: boolean[]): ReactNode[] => {
    const rows: ReactNode[] = []
    const count = list.length
    for (let index = 0; index < count; index += 1) {
      const entry = list[index]
      const isLast = index === count - 1
      const isExpanded = entry.isDir && expanded.has(entry.path)
      const rowClass = ['df-row', selected === entry.path ? 'df-row-selected' : '', entry.hidden ? 'df-hidden' : '']
        .filter(Boolean)
        .join(' ')
      rows.push(createElement('div', {
        key: entry.path,
        className: rowClass,
        title: entry.path,
        onClick: () => toggle(entry),
        onContextMenu: (event: MouseEvent) => {
          event.preventDefault()
          setMenu({ x: event.clientX, y: event.clientY, path: entry.path, isDir: entry.isDir })
        },
      },
        ...(depth > 0 ? guideSlots(depth, ancestors, isLast) : []),
        createElement('span', {
          className: entry.isDir
            ? `df-arrow${isExpanded ? ' df-arrow-open' : ''}`
            : 'df-arrow df-arrow-empty',
        }, entry.isDir ? createElement('span', { className: 'df-arrow-ico' }, treeArrow(10)) : null),
        createElement('span', { className: 'df-type' },
          entry.isDir
            ? folderIcon(isExpanded)
            : fileIcon(entry.name, files?.iconFor(entry.name), files?.fallbackIcon())),
        createElement('span', { className: 'df-name' }, entry.name),
        createElement('span', { className: 'df-row-actions' },
          entry.isDir
            ? createElement('button', {
              className: 'df-row-action',
              title: '刷新',
              onClick: (event: MouseEvent) => { event.stopPropagation(); refreshDir(entry.path) },
            }, refreshIcon(12))
            : null,
          createElement('button', {
            className: 'df-row-action',
            title: '复制路径',
            onClick: (event: MouseEvent) => { event.stopPropagation(); copyPath(entry.path) },
          }, copyIcon(12)),
        ),
      ))
      if (isExpanded) {
        const kids = children.get(entry.path)
        if (kids === undefined) {
          // Directory listing in flight: a spinner row in the child position.
          rows.push(createElement('div', {
            key: `${entry.path}:loading`,
            className: 'df-loading-row',
          },
            ...guideSlots(depth + 1, [...ancestors, !isLast], false),
            createElement('span', { className: 'df-loading-ico' }, loadingIcon(10, 'df-spin')),
          ))
        } else if (kids.length > 0) {
          rows.push(...renderLevel(kids, depth + 1, [...ancestors, !isLast]))
        }
      }
    }
    return rows
  }

  // File/dir context menu (independent of the dock shell's own menu). Items
  // use the .df-context-menu-item class for hover/active feedback; both
  // mousedown (immediate) and click (full sequence) fire the action —
  // refresh and copy are idempotent, so a double fire is harmless. A
  // full-screen backdrop below the menu closes it on outside click.
  const menuItem = (key: string, icon: ReactNode, label: string, action: () => void): ReactNode =>
    createElement('div', {
      key,
      className: 'df-context-menu-item',
      onMouseDown: action,
      onClick: action,
    }, icon, createElement('span', null, label))

  const menuItems: ReactNode[] = menu !== null && menu.isDir
    ? [
      menuItem('refresh', refreshIcon(13), '刷新', () => refreshDir(menu.path)),
      menuItem('copy', copyIcon(13), '复制路径', () => copyPath(menu.path)),
    ]
    : menu !== null
      ? [menuItem('copy', copyIcon(13), '复制路径', () => copyPath(menu.path))]
      : []

  const menuEl = menu === null ? null : createElement(Fragment, null,
    createElement('div', {
      className: 'df-context-backdrop',
      onMouseDown: () => setMenu(null),
      onContextMenu: (event: MouseEvent) => event.preventDefault(),
    }),
    createElement('div', {
      className: 'df-context-menu',
      style: { left: menu.x, top: menu.y },
      onMouseDown: (event: MouseEvent) => event.stopPropagation(),
    }, ...menuItems),
  )

  const rows = renderLevel(entries, 0, [])

  return createElement('div', { className: 'df-view' },
    createElement('div', { className: 'df-toolbar' },
      createElement('div', {
        className: 'df-toolbar-name',
        title: root ?? undefined,
        onClick: () => { setMenu(null); void load() },
      },
        folderIcon(true, 13),
        createElement('span', null, root ?? '…'),
      ),
      createElement('button', {
        className: 'df-icon-btn',
        title: '刷新',
        disabled: loading,
        onClick: () => { setMenu(null); void load() },
      }, refreshIcon(14, loading ? 'df-spin' : undefined)),
      createElement('button', {
        className: 'df-icon-btn',
        title: '折叠全部',
        onClick: collapseAll,
      },
        createElement('span', { className: 'df-icon-stack' },
          chevronUpIcon(10),
          chevronUpIcon(10),
        ),
      ),
    ),
    createElement('div', { className: 'df-tree' },
      ...(entries.length === 0
        ? [createElement('div', { key: 'empty', className: 'df-empty' }, '空目录')]
        : rows),
    ),
    // Portal to <body>: a transform on an ancestor (dock-mode floating panel)
    // would otherwise turn the menu's fixed coordinates into panel-relative
    // ones and render it off-screen.
    menuEl !== null ? createPortal(menuEl, document.body) : null,
  )
}
