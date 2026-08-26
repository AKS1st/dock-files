/**
 * Client half of dock-files: the file-domain host. It owns the "file"
 * concept (the explorer panel browses files) and dispatches opening a file
 * to registered file viewers (e.g. dock-editor) through the workbench's
 * editor-area carrier. It no longer renders file content itself — viewers
 * do. Type-only imports only; all runtime collaboration goes through
 * ctx.workbench / ctx.files method calls.
 */
import { createElement, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type {} from './contract.ts'
import type { IconSpec, ViewProps, WorkbenchContext, WorkbenchService } from './contract.ts'
import { ExplorerView } from './ExplorerView'
import { TransferStatusBar, TransferView, transferIcon } from './TransferView'
import { collapseAllIcon, refreshIcon, uploadIcon } from './icons'

export { openTransferView } from './TransferView'
import { mountStyles } from './styles'
import { getSnapshot as getTransferSnapshot, subscribe as subscribeTransfers, type TransferStatus } from './transferStore'

/** Requires the workbench base to be mounted. */
export const inject = ['workbench']

/** Folder icon (fill style, currentColor), rendered by the dock shell. */
const FOLDER_ICON: IconSpec = {
  path: 'M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z',
}

/**
 * A file-type icon registered by a viewer and shown in the explorer for the
 * matching extensions. `color` tints the glyph; `path` replaces the generic
 * document silhouette with a custom SVG glyph (fill style, evenodd holes).
 */
export interface FileTypeIcon {
  /** Tint color (any CSS color). When absent the built-in per-type palette applies. */
  color?: string
  /** Custom glyph: an SVG path `d` in a 16×16 viewBox (fill + evenodd holes). */
  path?: string
  /** Override the glyph viewBox (default '0 0 16 16'). */
  viewBox?: string
}

/** One registered file viewer (dock-editor registers itself here). */
interface FileViewerDef {
  id: string
  /** Lowercase extensions without dots; [] or undefined = catch-all default. */
  exts?: string[]
  /** Catch-all fallback when no extension matches. */
  default?: boolean
  /**
   * Explorer icon for this viewer's file types: extension-matched icons win
   * over the built-in palette; the default viewer's icon is the fallback for
   * types with no registered icon and no palette entry.
   */
  icon?: FileTypeIcon
}

/** The file-domain service dock-files provides as `ctx.files`. */
export interface FilesService {
  /** Open a file: dispatch to the matching viewer, carried by the workbench. */
  open(path: string, options?: { title?: string; mode?: 'tab' | 'floating' }): void
  /**
   * Whether a registered viewer can open `path` (extension match first, then
   * the catch-all default). The chat open-path bridge consults this before
   * routing a conversation path into the workbench.
   */
  canOpen(path: string): boolean
  /** Register a file viewer (returns the disposer). */
  registerFileViewer(def: FileViewerDef): () => void
  /**
   * Resolve the registered explorer icon for a file name: the first viewer
   * whose extensions match and carries an icon, else the first
   * `registerFileIcon` registration whose extensions match, else undefined.
   * The explorer falls back to the built-in palette, then to
   * `fallbackIcon()`, then to the generic tint.
   */
  iconFor(name: string): FileTypeIcon | undefined
  /**
   * Register an explorer icon for a set of extensions without creating a
   * viewer (returns the disposer). Unlike a viewer's single icon, this lets
   * one plugin own many per-type icons (e.g. dock-editor registering one
   * code glyph per source family with its own color).
   */
  registerFileIcon(def: { exts: string[]; icon: FileTypeIcon }): () => void
  /**
   * The default viewer's registered icon — the explorer's fallback for file
   * types with no registered icon and no built-in palette entry.
   */
  fallbackIcon(): FileTypeIcon | undefined
  /** Subscribe to viewer/icon registry changes (returns the disposer). */
  subscribe(listener: () => void): () => void
  /** Monotonic registry version — the useSyncExternalStore snapshot. */
  getIconVersion(): number
}

function baseNameOf(path: string): string {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return at === -1 ? path : path.slice(at + 1)
}

function extOfPath(path: string): string {
  const at = path.lastIndexOf('.')
  if (at === -1) return ''
  return path.slice(at + 1).toLowerCase()
}

/** Build the file-domain service bound to the workbench carrier. */
function createFilesService(workbench: WorkbenchService): FilesService {
  const viewers = new Map<string, FileViewerDef>()
  const fileIcons: { exts: string[]; icon: FileTypeIcon }[] = []
  let version = 0
  const listeners = new Set<() => void>()
  const bump = (): void => {
    version += 1
    for (const listener of listeners) listener()
  }
  const open = (path: string, options?: { title?: string; mode?: 'tab' | 'floating' }): void => {
    const matched = resolveViewer(path)
    if (matched === undefined) {
      console.warn(`[dock-files] no file viewer registered for "${path}" (install dock-editor)`)
      return
    }
    const seed = { path, title: options?.title ?? baseNameOf(path) }
    workbench.openView(matched.id, seed, { floating: options?.mode === 'floating' })
  }
  /** The viewer a path dispatches to (extension match, then the default). */
  const resolveViewer = (path: string): FileViewerDef | undefined => {
    const ext = extOfPath(path)
    // Extension match first (registration order), then the default viewer.
    return [...viewers.values()].find((v) => v.exts?.includes(ext))
      ?? [...viewers.values()].find((v) => v.default === true)
  }
  const canOpen = (path: string): boolean => resolveViewer(path) !== undefined
  const registerFileViewer = (def: FileViewerDef): (() => void) => {
    viewers.set(def.id, def)
    bump()
    return () => {
      if (viewers.get(def.id) !== def) return
      viewers.delete(def.id)
      bump()
    }
  }
  const registerFileIcon = (def: { exts: string[]; icon: FileTypeIcon }): (() => void) => {
    fileIcons.push(def)
    bump()
    return () => {
      const at = fileIcons.indexOf(def)
      if (at !== -1) {
        fileIcons.splice(at, 1)
        bump()
      }
    }
  }
  const iconFor = (name: string): FileTypeIcon | undefined => {
    const ext = extOfPath(name)
    // Extension match only (registration order): viewer icons first, then
    // file-icon registrations; the default viewer's icon is exposed
    // separately so the explorer can keep palette precedence.
    return [...viewers.values()].find((v) => v.exts?.includes(ext) && v.icon !== undefined)?.icon
      ?? fileIcons.find((def) => def.exts.includes(ext))?.icon
  }
  const fallbackIcon = (): FileTypeIcon | undefined =>
    [...viewers.values()].find((v) => v.default === true && v.icon !== undefined)?.icon
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  const getIconVersion = (): number => version
  return { open, canOpen, registerFileViewer, registerFileIcon, iconFor, fallbackIcon, subscribe, getIconVersion }
}

/** POST /wb-files/probe: stat an absolute path (existence + directory flag). */
async function probePath(path: string): Promise<{ exists: boolean; isDir: boolean }> {
  const response = await fetch('/wb-files/probe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path }),
  })
  const json = (await response.json()) as {
    ok: boolean
    value?: { exists: boolean; isDir: boolean }
    error?: { message: string }
  }
  if (json.ok !== true || json.value === undefined) {
    throw new Error(json.error?.message ?? 'probe failed')
  }
  return json.value
}

/** Minimal face of the harness workspace service (its only `openPath` caller
 *  is the conversation view's file-opener inject). */
interface WorkspacesFace {
  openPath(path: string): Promise<void>
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
function bridgeChatOpens(
  ctx: WorkbenchContext,
  workbench: WorkbenchService,
  files: FilesService,
  workspaces: WorkspacesFace,
): () => void {
  const nativeOpen = workspaces.openPath.bind(workspaces)
  workspaces.openPath = async (path: string): Promise<void> => {
    try {
      const probe = await probePath(path)
      if (probe.exists && !probe.isDir && files.canOpen(path)) {
        workbench.openPath(path)
        return
      }
    } catch {
      // Probe failure (bad path, network): keep the native behavior.
    }
    await nativeOpen(path)
  }
  return () => { workspaces.openPath = nativeOpen }
}

function dispatchHeaderAction(name: 'upload' | 'refresh' | 'collapse' | 'transfers'): void {
  document.dispatchEvent(new Event(`dock-files:${name}`))
}

const TERMINAL_TRANSFER_STATUSES: ReadonlySet<TransferStatus> = new Set(['completed', 'failed', 'cancelled', 'skipped'])

function DownloadIndicator({ count }: { count: number }): ReactNode {
  const [rotation, setRotation] = useState(0)
  useEffect(() => {
    if (count === 0) return
    const timer = window.setInterval(() => {
      setRotation((value) => (value + 12) % 360)
    }, 50)
    return () => window.clearInterval(timer)
  }, [count])
  if (count === 0) return transferIcon(14)
  return createElement('span', { className: 'df-download-indicator', 'aria-label': `${count} 个下载任务` },
    createElement('span', {
      className: 'df-download-spinner',
      'aria-hidden': true,
      style: { transform: `rotate(${rotation}deg)` },
    }),
    createElement('span', { className: 'df-download-count' }, count > 9 ? '9+' : String(count)),
  )
}

/** Actions rendered in the dock shell's fixed Files title row. */
function FilesHeaderActions(_props: ViewProps): ReactNode {
  const transferSnapshot = useSyncExternalStore(subscribeTransfers, getTransferSnapshot)
  const activeTransferCount = transferSnapshot.tasks.filter((task) =>
    !TERMINAL_TRANSFER_STATUSES.has(task.status)).length
  const button = (key: 'upload' | 'refresh' | 'collapse' | 'transfers', title: string, icon: ReactNode): ReactNode =>
    createElement('button', {
      key,
      className: 'df-icon-btn',
      title,
      onClick: () => dispatchHeaderAction(key),
    }, icon)
  return createElement('div', { className: 'df-shell-actions' },
    createElement('div', { className: 'df-shell-action-row' },
      button('upload', '上传', uploadIcon(14)),
      button('refresh', '刷新', refreshIcon(14)),
      button('collapse', '折叠全部', collapseAllIcon(14)),
      button('transfers', activeTransferCount > 0 ? `传输任务 ${activeTransferCount > 9 ? '9+' : activeTransferCount}` : '打开传输中心', createElement(DownloadIndicator, { count: activeTransferCount })),
    ),
  )
}

/** Client plugin body. */
export function apply(ctx: WorkbenchContext): void {
  const workbench = ctx.get<WorkbenchService>('workbench')
  // Optional-peer guard: skip silently when the base is absent.
  if (workbench === undefined) return

  // Shell styles (context-menu hover/active feedback).
  ctx.effect(() => mountStyles(), 'dock-files: styles')

  // File-domain service: viewers (dock-editor) register here, the explorer
  // and system open-path entry dispatch through it.
  const files = createFilesService(workbench)
  ctx.provide('files', files)

  // System entry: external paths (chat links, other plugins) route in.
  // The editor only supports standalone-window mode, so always open floating.
  ctx.effect(() => workbench.registerOpenPathHandler((path, options) => {
    files.open(path, { title: options?.title, mode: 'floating' })
  }), 'dock-files: open-path handler')

  // Chat open-path bridge: conversation file paths open through the harness's
  // native opener, which errors on hosts without a desktop association. Route
  // viewable files into the workbench viewers instead (folders, missing paths
  // and unviewable types keep the native opener). The harness runtime may
  // mount after the dock patch rows, so wait for the service when it is not
  // present yet instead of silently dropping the bridge.
  ctx.effect(() => {
    let restore: (() => void) | undefined
    let off: (() => void) | undefined
    const install = (ws: WorkspacesFace): void => {
      if (restore !== undefined) return
      off?.()
      restore = bridgeChatOpens(ctx, workbench, files, ws)
    }
    const existing = ctx.get<WorkspacesFace>('workspaces')
    if (existing !== undefined) {
      install(existing)
    } else {
      off = ctx.on('internal/service', (...args: unknown[]) => {
        if (args[0] !== 'workspaces') return
        install(args[1] as WorkspacesFace)
      })
    }
    return () => {
      off?.()
      restore?.()
    }
  }, 'dock-files: chat open-path bridge')

  // Activity item: the left strip entry that reveals the files pane.
  ctx.effect(() => workbench.registerActivityBarItem({
    id: 'files',
    title: 'Files',
    icon: FOLDER_ICON,
    order: 10,
    paneId: 'files',
  }), 'dock-files: activity item')

  // The side-bar pane itself — a pure file browser now.
  ctx.effect(() => workbench.registerPanel({
    id: 'files',
    region: 'sideBar',
    title: 'Files',
    icon: FOLDER_ICON,
    order: 10,
    component: ExplorerView,
    headerComponent: FilesHeaderActions,
  }), 'dock-files: files panel')

  // Transfer center: an independent floating editor view and status-bar entry.
  ctx.effect(() => workbench.registerEditorView({
    id: 'transfers',
    title: 'Transfers',
    icon: FOLDER_ICON,
    order: 20,
    component: TransferView,
  }), 'dock-files: transfers view')
  ctx.effect(() => workbench.registerStatusBarItem({
    id: 'transfers',
    order: 20,
    component: TransferStatusBar,
  }), 'dock-files: transfers status')
}
