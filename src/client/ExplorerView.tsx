/**
 * Pure file browser: a lazy recursive directory tree over the active
 * session's working directory (own /wb-files host route). Clicking a file
 * dispatches through the file-domain service (`ctx.files.open`) to a
 * registered file viewer (desk-editor) — this view never renders file
 * content itself.
 */
import { createElement, useCallback, useEffect, useState, type ReactNode } from 'react'
import type { ViewProps } from 'desk/client/contract'
import type { FilesService } from './index'

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

const INLINE = {
  row: { display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px', cursor: 'pointer', borderRadius: 4, fontSize: 13, whiteSpace: 'nowrap' } as const,
  dim: { opacity: 0.55 },
  selected: { background: 'var(--dsw-alias-interactive-bg-hover-accent, rgba(9, 105, 218, 0.12))' } as const,
  err: { padding: '8px 12px', color: '#d1242f', fontSize: 12 } as const,
  loading: { padding: '8px 12px', color: 'var(--dsw-alias-label-secondary, #656d76)', fontSize: 12 } as const,
}

export function ExplorerView(props: ViewProps): ReactNode {
  const { ctx, sessionId, active } = props
  const [root, setRoot] = useState<string | null>(null)
  const [entries, setEntries] = useState<FsEntry[] | null>(null)
  const [children, setChildren] = useState<Map<string, FsEntry[]>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; path: string } | null>(null)
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
    if (active) void load()
  }, [active, load])

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

  const openFile = (path: string, mode: 'tab' | 'floating'): void => {
    setSelected(path)
    setMenu(null)
    ctx.get<FilesService>('files')?.open(path, { mode })
  }

  const toggle = (entry: FsEntry): void => {
    if (!entry.isDir) {
      openFile(entry.path, 'tab')
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

  if (error !== null) {
    return createElement('div', { style: INLINE.err }, error)
  }
  if (entries === null) {
    return createElement('div', { style: INLINE.loading }, loading ? 'Loading…' : 'No session')
  }

  /** Recursively render a level of entries with running indentation. */
  const renderLevel = (list: FsEntry[], depth: number): ReactNode[] => {
    const rows: ReactNode[] = []
    for (const entry of list) {
      const isExpanded = entry.isDir && expanded.has(entry.path)
      rows.push(createElement('div', {
        key: entry.path,
        style: {
          ...INLINE.row,
          paddingLeft: 8 + depth * 16,
          ...(entry.hidden ? INLINE.dim : {}),
          ...(selected === entry.path ? INLINE.selected : {}),
        },
        title: entry.path,
        onClick: () => toggle(entry),
        onContextMenu: (event: MouseEvent) => {
          if (entry.isDir) return
          event.preventDefault()
          setMenu({ x: event.clientX, y: event.clientY, path: entry.path })
        },
      },
      createElement('span', null, entry.isDir
        ? (isExpanded ? '▾' : '▸')
        : '•'),
      createElement('span', null, entry.name),
      ))
      if (isExpanded) {
        const kids = children.get(entry.path)
        if (kids === undefined) {
          rows.push(createElement('div', {
            key: `${entry.path}:loading`,
            style: { ...INLINE.loading, paddingLeft: 24 + depth * 16 },
          }, '…'))
        } else {
          rows.push(...renderLevel(kids, depth + 1))
        }
      }
    }
    return rows
  }

  const rows: ReactNode[] = []
  if (root !== null) {
    rows.push(createElement('div', {
      key: 'root',
      style: { ...INLINE.row, fontWeight: 600, marginTop: 4 },
      onClick: () => { setEntries(null); void load() },
    }, '↺ ', root))
  }
  rows.push(...renderLevel(entries, 0))

  // Minimal file context menu (independent of the desk shell's own menu).
  const menuEl = menu === null ? null : createElement('div', {
    style: {
      position: 'fixed', left: menu.x, top: menu.y, zIndex: 90, minWidth: 140,
      padding: 4, borderRadius: 8, fontSize: 13,
      background: 'var(--dsw-alias-bg-layer-2, #ffffff)',
      border: '1px solid var(--dsw-alias-border-l2, #d8dbe0)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
      color: 'var(--dsw-alias-label-primary, #1f2328)',
    },
    onMouseDown: (event: MouseEvent) => event.stopPropagation(),
  },
  createElement('div', {
    style: { padding: '5px 10px', borderRadius: 5, cursor: 'pointer' },
    onMouseDown: () => openFile(menu.path, 'tab'),
  }, '在中心打开'),
  createElement('div', {
    style: { padding: '5px 10px', borderRadius: 5, cursor: 'pointer' },
    onMouseDown: () => openFile(menu.path, 'floating'),
  }, '在独立窗口打开'),
  )

  return createElement('div', { className: 'dsh-wb-view' },
    rows,
    menuEl,
  )
}
