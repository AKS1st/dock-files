/**
 * Client half of dock-files: the file-domain host. It owns the "file"
 * concept (the explorer panel browses files) and dispatches opening a file
 * to registered file viewers (e.g. dock-editor) through the workbench's
 * editor-area carrier. It no longer renders file content itself — viewers
 * do. Type-only imports only; all runtime collaboration goes through
 * ctx.workbench / ctx.files method calls.
 */
import type {} from './contract.ts'
import type { IconSpec, WorkbenchContext, WorkbenchService } from './contract.ts'
import { ExplorerView } from './ExplorerView'
import { mountStyles } from './styles'

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
    const ext = extOfPath(path)
    // Extension match first (registration order), then the default viewer.
    const matched = [...viewers.values()].find((v) => v.exts?.includes(ext))
      ?? [...viewers.values()].find((v) => v.default === true)
    if (matched === undefined) {
      console.warn(`[dock-files] no file viewer registered for "${path}" (install dock-editor)`)
      return
    }
    const seed = { path, title: options?.title ?? baseNameOf(path) }
    workbench.openView(matched.id, seed, { floating: options?.mode === 'floating' })
  }
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
  return { open, registerFileViewer, registerFileIcon, iconFor, fallbackIcon, subscribe, getIconVersion }
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
  }), 'dock-files: files panel')
}
