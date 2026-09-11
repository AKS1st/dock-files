import type { FilesService } from './index.ts'
import type { WorkbenchService } from './contract.ts'

export interface OpenResourceOptions {
  [key: string]: unknown
}

export interface SidebarRightFace {
  openResource(address: string, options?: OpenResourceOptions): void
}

export interface SessionsFace {
  list: {
    getSnapshot(): {
      current?: string
      byId: Record<string, { cwd?: string }>
    }
  }
}

export type OpenSourceMode = 'dock' | 'harness'

export interface OpenPathBridgeController {
  mount(sidebarRight: SidebarRightFace): void
  sync(): void
  dispose(): void
}

/** Keep the optional sidebarRight service and bridge lifecycle in one place. */
export function createOpenPathBridgeController(
  getMode: () => OpenSourceMode,
  install: (sidebarRight: SidebarRightFace, mode: OpenSourceMode) => () => void,
): OpenPathBridgeController {
  let mounted: SidebarRightFace | undefined
  let restore: (() => void) | undefined
  let disposed = false
  const uninstall = (): void => { restore?.(); restore = undefined }
  const sync = (): void => {
    if (disposed) return
    uninstall()
    if (mounted !== undefined) restore = install(mounted, getMode())
  }
  return {
    mount(sidebarRight) {
      if (disposed) return
      mounted = sidebarRight
      sync()
    },
    sync,
    dispose() {
      if (disposed) return
      disposed = true
      uninstall()
      mounted = undefined
    },
  }
}

async function probePath(path: string): Promise<{ exists: boolean; isDir: boolean }> {
  const response = await fetch('/wb-files/probe', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path }),
  })
  const json = await response.json() as { ok: boolean; value?: { exists: boolean; isDir: boolean }; error?: { message: string } }
  if (json.ok !== true || json.value === undefined) throw new Error(json.error?.message ?? 'probe failed')
  return json.value
}

function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%3A/gi, ':')
}

function encodePath(path: string): string {
  return path.split('/').map(encodeSegment).join('/')
}

function isAbsoluteWorkspacePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:\//.test(path) || path.startsWith('//')
}

/** Build a Harness file resource address using b67's per-segment encoding. */
export function sessionResourceAddress(sessionId: string, cwd: string | undefined, path: string): string {
  const normalized = path.replace(/\\/g, '/')
  if (!isAbsoluteWorkspacePath(normalized)) {
    const relative = normalized.replace(/^(?:\.\/)+/, '').replace(/^\/+/, '')
    return `dsh-resource://file/session/${encodeSegment(sessionId)}/${encodePath(relative)}`
  }
  const root = cwd?.replace(/\\/g, '/').replace(/\/+$/, '') ?? ''
  if (root !== '' && normalized === root) {
    return `dsh-resource://file/session/${encodeSegment(sessionId)}/`
  }
  if (root !== '' && normalized.startsWith(`${root}/`)) {
    return `dsh-resource://file/session/${encodeSegment(sessionId)}/${encodePath(normalized.slice(root.length + 1))}`
  }
  const unc = normalized.startsWith('//')
  const absolute = normalized.replace(/^\/+/, '')
  return `dsh-resource://file/absolute/${unc ? '/' : ''}${encodePath(absolute)}`
}

function decodeSegments(parts: string[]): string[] | undefined {
  try { return parts.map((part) => decodeURIComponent(part)) } catch { return undefined }
}

/** Resolve only the b67 file resource carriers; all other addresses stay native. */
function resourcePath(address: string, sessions: SessionsFace): string | undefined {
  let url: URL
  try { url = new URL(address) } catch { return undefined }
  if (url.protocol !== 'dsh-resource:' || url.host !== 'file') return undefined
  const raw = url.pathname.split('/').slice(1)
  if (raw.length < 2) return undefined
  const scope = raw[0]
  // The b67 grammar requires a path segment, including the empty root segment.
  if (scope === 'session' && raw.length < 3) return undefined
  const decoded = decodeSegments(raw.slice(1))
  if (decoded === undefined) return undefined
  if (scope === 'session') {
    const sessionId = decoded[0]
    if (sessionId === undefined || sessionId === '') return undefined
    const cwd = sessions.list.getSnapshot().byId[sessionId]?.cwd
    if (cwd === undefined || cwd === '') return undefined
    const relative = decoded.slice(1).join('/')
    return relative === '' ? cwd : `${cwd.replace(/[\\/]$/, '')}/${relative}`
  }
  if (scope === 'absolute') {
    if (decoded.length === 0 || decoded[0] === '' && decoded.length === 1) return undefined
    const value = decoded.join('/')
    if (/^[A-Za-z]:\//.test(value)) return value
    if (value.startsWith('//')) return value
    return `/${value}`
  }
  return undefined
}

/**
 * Dock mode wraps sidebarRight.openResource. Harness mode deliberately leaves
 * the canonical Harness carrier untouched and installs no wrapper.
 */
export function bridgeChatOpens(
  sidebarRight: SidebarRightFace,
  workbench: WorkbenchService,
  files: FilesService,
  mode: OpenSourceMode = 'dock',
  sessions?: SessionsFace,
): () => void {
  if (mode === 'harness' || sessions === undefined) return () => undefined
  const original = sidebarRight.openResource
  let generation = 0
  let active = true
  sidebarRight.openResource = async function openResource(address: string, options?: OpenResourceOptions): Promise<void> {
    const requestGeneration = generation
    const path = resourcePath(address, sessions as SessionsFace)
    if (path !== undefined) {
      try {
        const probe = await probePath(path)
        if (active && requestGeneration === generation && probe.exists && !probe.isDir && files.canOpen(path)) {
          workbench.openPath(path)
          return
        }
      } catch { /* preserve Harness behavior on probe failure */ }
    }
    original.call(sidebarRight, address, options)
  }
  return () => {
    active = false
    generation += 1
    if (sidebarRight.openResource !== original) sidebarRight.openResource = original
  }
}
