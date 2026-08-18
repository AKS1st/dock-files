/**
 * File explorer view: a lazy directory tree browsing the active session's
 * working directory through the plugin's own /wb-files host route (typed
 * fetch, no base dependency beyond the view contract). Phase 1: single
 * level of expansion per directory, files are inert placeholders; file
 * opening lands in a later phase.
 */
import { createElement, useCallback, useEffect, useState, type ReactNode } from 'react'
import type { ViewProps } from 'desk/client/contract'

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
  row: { display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px', cursor: 'pointer', borderRadius: 4, fontSize: 13 } as const,
  dim: { opacity: 0.55 },
  err: { padding: '8px 12px', color: '#d1242f', fontSize: 12 } as const,
  loading: { padding: '8px 12px', color: 'var(--dsw-text-secondary, #656d76)', fontSize: 12 } as const,
}

export function ExplorerView(props: ViewProps): ReactNode {
  const { sessionId, active } = props
  const [root, setRoot] = useState<string | null>(null)
  const [entries, setEntries] = useState<FsEntry[] | null>(null)
  const [children, setChildren] = useState<Map<string, FsEntry[]>>(new Map())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
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

  const toggle = (entry: FsEntry): void => {
    if (!entry.isDir) return
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(entry.path)) {
        next.delete(entry.path)
        return next
      }
      next.add(entry.path)
      void (async () => {
        try {
          const response = await fetch('/wb-files/list', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId, path: entry.path }),
          })
          const json = (await response.json()) as ListResponse
          if (json.ok === true && json.value !== undefined) {
            setChildren((previous) => {
              const next = new Map(previous)
              next.set(entry.path, json.value!.listing.entries)
              return next
            })
          }
        } catch {
          // expansion failure: leave the node collapsed
          setExpanded((previous) => {
            const dropped = new Set(previous)
            dropped.delete(entry.path)
            return dropped
          })
        }
      })()
      return next
    })
  }

  if (error !== null) {
    return createElement('div', { style: INLINE.err }, error)
  }
  if (entries === null) {
    return createElement('div', { style: INLINE.loading }, loading ? 'Loading…' : 'No session')
  }

  const rows: ReactNode[] = []
  if (root !== null) {
    rows.push(createElement('div', {
      key: 'root',
      style: { ...INLINE.row, fontWeight: 600, marginTop: 4 },
      onClick: () => { setEntries(null); void load() },
    }, '↺ ', root))
  }
  for (const entry of entries) {
    rows.push(createElement('div', {
      key: entry.path,
      style: entry.hidden ? { ...INLINE.row, ...INLINE.dim } : INLINE.row,
      title: entry.path,
      onClick: () => toggle(entry),
    },
    createElement('span', null, entry.isDir
      ? (expanded.has(entry.path) ? '▾' : '▸')
      : '•'),
    createElement('span', null, entry.name),
    ))
    if (entry.isDir && expanded.has(entry.path)) {
      const kids = children.get(entry.path)
      if (kids !== undefined) {
        for (const kid of kids) {
          rows.push(createElement('div', {
            key: kid.path,
            style: { ...INLINE.row, paddingLeft: 24, ...(kid.hidden ? INLINE.dim : {}) },
            onClick: () => toggle(kid),
          },
          createElement('span', null, kid.isDir ? '▸' : '•'),
          createElement('span', null, kid.name),
          ))
        }
      } else {
        rows.push(createElement('div', { key: `${entry.path}:loading`, style: INLINE.loading }, '…'))
      }
    }
  }
  return createElement('div', { className: 'dsh-wb-view' }, rows)
}
