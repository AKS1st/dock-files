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
import { createElement, Fragment, useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ViewProps } from './contract.ts'
import type { FilesService } from './index'
import {
  chevronUpIcon,
  copyIcon,
  cutIcon,
  editIcon,
  fileIcon,
  folderIcon,
  imageIcon,
  loadingIcon,
  newFolderIcon,
  openIcon,
  pasteIcon,
  plusIcon,
  refreshIcon,
  trashIcon,
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

/** What the context menu was opened on. */
type MenuTarget =
  | { kind: 'file'; path: string }
  | { kind: 'dir'; path: string }
  | { kind: 'empty' }

/** One open context menu. */
interface MenuState {
  x: number
  y: number
  target: MenuTarget
}

/** The explorer clipboard: one path in copy or cut (move) mode. */
interface ClipboardState {
  mode: 'copy' | 'cut'
  path: string
}

/** A themed in-app dialog (replaces native confirm/alert). */
interface DialogState {
  kind: 'confirm' | 'alert'
  message: string
  /** Confirm primary-button label (defaults to 确定). */
  confirmLabel?: string
  /** Style the confirm button as destructive (delete). */
  danger?: boolean
  /** Runs after the confirm button is pressed (dialog already closed). */
  onConfirm?: () => void
}

/** Stable no-op subscription/snapshot for useSyncExternalStore without the files service. */
const NOOP_SUBSCRIBE = (): (() => void) => () => {}
const NOOP_SNAPSHOT = (): number => 0

/** Call one /wb-files host method; throws on non-ok responses. */
async function callFiles(method: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`/wb-files/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = (await response.json()) as {
    ok: boolean
    value?: Record<string, unknown>
    error?: { code: string; message: string }
  }
  if (json.ok !== true || json.value === undefined) {
    throw new Error(json.error?.message ?? `${method} failed`)
  }
  return json.value
}

function baseNameOf(path: string): string {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return at === -1 ? path : path.slice(at + 1)
}

/** Parent directory of a path, or null at the filesystem root. */
function parentPathOf(path: string): string | null {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (at === -1) return null
  return at === 0 ? (path.startsWith('\\') ? '\\' : '/') : path.slice(0, at)
}

/** Read a Blob as a base64 data URL (used for clipboard images and uploads). */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('failed to read image'))
    reader.readAsDataURL(blob)
  })
}

/** One file handed to the upload pipeline (mime set → saveImage route). */
interface UploadItem {
  name: string
  blob: Blob
  mime?: string
}

/**
 * XHR POST that reports request-body progress (fetch has no upload
 * progress events); resolves with the API value, rejects on non-ok bodies.
 */
function xhrUpload(url: string, body: string, onProgress: (loaded: number) => void): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('content-type', 'application/json')
    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (event.lengthComputable && event.loaded > 0) onProgress(event.loaded)
    }
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText) as {
          ok: boolean
          value?: Record<string, unknown>
          error?: { code: string; message: string }
        }
        if (json.ok !== true || json.value === undefined) {
          throw new Error(json.error?.message ?? 'upload failed')
        }
        resolve(json.value)
      } catch (cause) {
        reject(cause)
      }
    }
    xhr.onerror = () => reject(new Error('upload failed'))
    xhr.send(body)
  })
}

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
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null)
  const [renaming, setRenaming] = useState<{ path: string; value: string } | null>(null)
  /** Clipboard-image probe result for the current menu: 'has' shows the
   *  "paste image" item; any other state hides it (no image / unsupported /
   *  read denied). */
  const [imageProbe, setImageProbe] = useState<'unknown' | 'has' | 'none'>('unknown')
  const [dialog, setDialog] = useState<DialogState | null>(null)
  /** Internal drag: the path being dragged (dimmed), and the highlighted drop target. */
  const [dragSource, setDragSource] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  /** Upload pipeline: one transfer at a time; progress 0..1 drives the 1px bar. */
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  /** Ref mirror of `uploading` so stale closures (paste/drag listeners) see the live guard. */
  const uploadingRef = useRef(false)
  /** Ctrl+V paste target: the last clicked/right-clicked directory (null = root). */
  const [pasteDir, setPasteDir] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<HTMLDivElement | null>(null)

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
    setClipboard(null)
    setRenaming(null)
    setDragSource(null)
    setDragOver(null)
    setPasteDir(null)
    if (active) void load()
  }, [active, load, sessionId])

  /**
   * Fetch and cache one directory level. `keepExpanded` (used by refresh
   * flows) leaves the node as-is on failure instead of collapsing it.
   */
  const fetchChildren = useCallback(async (path: string, keepExpanded = false): Promise<void> => {
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
      if (keepExpanded) return
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

  /**
   * Refresh one directory level in place: refetch its children without
   * clearing the current cache, so an expanded directory never collapses or
   * flashes a spinner while refreshing (a failed refetch leaves it as-is).
   */
  const refreshDir = (path: string): void => {
    setMenu(null)
    void fetchChildren(path, true)
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

  /** Show a themed alert (replaces the native browser alert). */
  const alertDialog = (message: string): void => {
    setDialog({ kind: 'alert', message })
  }

  /** Show a themed confirm; `onConfirm` runs when the primary button is pressed. */
  const confirmDialog = (
    message: string,
    onConfirm: () => void,
    options?: { confirmLabel?: string; danger?: boolean },
  ): void => {
    setDialog({
      kind: 'confirm',
      message,
      onConfirm,
      confirmLabel: options?.confirmLabel ?? '确定',
      danger: options?.danger,
    })
  }

  /** Report a mutation error through the themed alert. */
  const reportError = (cause: unknown): void => {
    alertDialog(cause instanceof Error ? cause.message : String(cause))
  }

  /** Refetch the directory that contains `path` (the root reloads fully). */
  const refreshParentOf = (path: string): void => {
    const parent = parentPathOf(path)
    if (parent === null || parent === root) void load()
    else refreshDir(parent)
  }

  /** Refetch a directory's own contents (the root reloads fully). */
  const refreshDirContents = (dir: string): void => {
    if (dir === root) void load()
    else refreshDir(dir)
  }

  const beginRename = (path: string): void => {
    setMenu(null)
    setSelected(path)
    setRenaming({ path, value: baseNameOf(path) })
  }

  const cancelRename = (): void => setRenaming(null)

  const commitRename = (): void => {
    if (renaming === null) return
    const { path, value } = renaming
    const name = value.trim()
    setRenaming(null)
    if (name === '' || name === baseNameOf(path)) return
    void (async () => {
      try {
        await callFiles('rename', { sessionId, path, name })
        refreshParentOf(path)
      } catch (cause) {
        reportError(cause)
      }
    })()
  }

  /** Create a new entry and drop straight into inline rename. */
  const startCreate = (kind: 'file' | 'dir', parent: string): void => {
    setMenu(null)
    void (async () => {
      try {
        const value = await callFiles('create', { sessionId, parent, kind })
        const path = String(value.path ?? '')
        // Make the new entry visible so its inline rename box shows: reload
        // the root, or expand + refresh a non-root parent directory (the
        // in-place refresh keeps the parent expanded and never collapses it).
        if (parent === root) {
          void load()
        } else {
          setExpanded((previous) => {
            const next = new Set(previous)
            next.add(parent)
            return next
          })
          refreshDir(parent)
        }
        setRenaming({ path, value: String(value.name ?? baseNameOf(path)) })
      } catch (cause) {
        reportError(cause)
      }
    })()
  }

  const setClip = (mode: 'copy' | 'cut', path: string): void => {
    setMenu(null)
    setSelected(path)
    setClipboard({ mode, path })
  }

  /** Paste the clipboard item into `dest` (copy keeps the clipboard; cut clears it). */
  const pasteInto = (dest: string): void => {
    setMenu(null)
    if (clipboard === null) return
    const { mode, path: source } = clipboard
    void (async () => {
      try {
        await callFiles(mode === 'copy' ? 'copy' : 'move', { sessionId, sources: [source], dest })
        if (mode === 'cut') {
          refreshParentOf(source)
          setClipboard(null)
        }
        refreshDirContents(dest)
      } catch (cause) {
        reportError(cause)
      }
    })()
  }

  /**
   * Probe the system clipboard for an image so the "paste image" menu item
   * shows only when one is actually available. Called while opening a menu;
   * the right-click is a user gesture, so the first read may raise the
   * browser's clipboard permission prompt. Any failure (unsupported API,
   * permission denied, no image) hides the item.
   */
  const probeClipboardImage = (): void => {
    setImageProbe('unknown')
    void (async () => {
      let has = false
      try {
        if (typeof navigator.clipboard !== 'undefined' && typeof navigator.clipboard.read === 'function') {
          const items = await navigator.clipboard.read()
          has = items.some((item) => item.types.some((type) => type.startsWith('image/')))
        }
      } catch {
        // Read denied or not permitted yet: keep the item hidden.
        has = false
      }
      setImageProbe(has ? 'has' : 'none')
    })()
  }

  /** Paste an image from the system clipboard into `dest` (saved as a file). */
  const pasteImageInto = (dest: string): void => {
    setMenu(null)
    void (async () => {
      try {
        if (typeof navigator.clipboard === 'undefined' || typeof navigator.clipboard.read !== 'function') {
          alertDialog('当前浏览器不支持读取剪贴板图片')
          return
        }
        const items = await navigator.clipboard.read()
        const imageType = items
          .map((item) => item.types.find((type) => type.startsWith('image/')))
          .find((type) => type !== undefined)
        if (imageType === undefined) {
          alertDialog('剪贴板中没有图片')
          return
        }
        const item = items.find((entry) => entry.types.includes(imageType))
        if (item === undefined) return
        const blob = await item.getType(imageType)
        runUpload([{ name: 'image', blob, mime: imageType }], dest)
      } catch (cause) {
        reportError(cause)
      }
    })()
  }

  /**
   * Serialized upload pipeline: one transfer at a time, driving the 1px
   * progress bar at the panel's bottom. An additional upload while one is
   * running is rejected with a themed notice.
   */
  const runUpload = (items: UploadItem[], dest: string): void => {
    setMenu(null)
    if (uploadingRef.current) {
      alertDialog('请等上一个上传任务完成')
      return
    }
    if (items.length === 0) return
    uploadingRef.current = true
    setUploading(true)
    setUploadProgress(0)
    void (async () => {
      try {
        // Read every file first so the progress total is known up front.
        const prepared = await Promise.all(items.map(async (item) => {
          const dataUrl = await blobToDataUrl(item.blob)
          const body = JSON.stringify({
            sessionId,
            parent: dest,
            name: item.name,
            ...(item.mime !== undefined ? { mime: item.mime } : {}),
            data: dataUrl.slice(dataUrl.indexOf(',') + 1),
          })
          return { body, method: item.mime !== undefined ? 'saveImage' : 'upload' }
        }))
        const totalBytes = prepared.reduce((sum, item) => sum + item.body.length, 0)
        let doneBytes = 0
        for (const item of prepared) {
          await xhrUpload(`/wb-files/${item.method}`, item.body, (loaded) => {
            setUploadProgress(totalBytes === 0 ? 1 : (doneBytes + loaded) / totalBytes)
          })
          doneBytes += item.body.length
        }
        setUploadProgress(1)
        refreshDirContents(dest)
      } catch (cause) {
        reportError(cause)
      } finally {
        uploadingRef.current = false
        setUploading(false)
        setUploadProgress(0)
      }
    })()
  }

  /** Import OS files (drag-in or Ctrl+V paste) into `dest` (unique names). */
  const uploadFiles = (files: FileList, dest: string): void => {
    // Dropped folders surface as zero-byte, empty-type File entries — skip them.
    const list = Array.from(files).filter((file) => !(file.size === 0 && file.type === ''))
    if (list.length === 0) return
    runUpload(list.map((file) => ({ name: file.name !== '' ? file.name : '文件', blob: file })), dest)
  }

  /** Move an entry dragged inside the tree into `dest` (never overwrites). */
  const moveDropped = (source: string, dest: string): void => {
    if (source === dest) return
    void (async () => {
      try {
        await callFiles('move', { sessionId, sources: [source], dest })
        refreshParentOf(source)
        refreshDirContents(dest)
      } catch (cause) {
        reportError(cause)
      }
    })()
  }

  /** Route a drop: external OS files are imported, internal drags are moved. */
  const handleDrop = (event: DragEvent, dest: string): void => {
    const dt = event.dataTransfer
    if (dt === null) return
    if (dt.files !== undefined && dt.files.length > 0) {
      uploadFiles(dt.files, dest)
      return
    }
    let source = dt.getData('application/x-dock-files')
    if (source === '') {
      const text = dt.getData('text/plain')
      source = text.startsWith('dock-files:') ? text.slice('dock-files:'.length) : ''
    }
    if (source !== '') moveDropped(source, dest)
  }

  /** Delete one entry after a themed confirmation (recursive for directories). */
  const removePath = (path: string): void => {
    setMenu(null)
    confirmDialog(`确定删除 "${baseNameOf(path)}"？此操作不可恢复。`, () => {
      void (async () => {
        try {
          await callFiles('remove', { sessionId, paths: [path] })
          setSelected((previous) => (previous === path ? null : previous))
          setChildren((previous) => {
            const next = new Map(previous)
            next.delete(path)
            return next
          })
          setClipboard((previous) => (previous?.path === path ? null : previous))
          refreshParentOf(path)
        } catch (cause) {
          reportError(cause)
        }
      })()
    }, { confirmLabel: '删除', danger: true })
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

  // Escape dismisses the dialog (backdrop click acts as cancel too).
  useEffect(() => {
    if (dialog === null) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setDialog(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog])

  // Local-file paste: the browser only exposes OS-copied files through the
  // paste event (clipboard.read() cannot), so Ctrl+V imports them while the
  // panel has focus. Text fields (e.g. the inline rename box) are skipped.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const el = viewRef.current
      if (el === null || root === null) return
      const active = document.activeElement
      if (active === null || !el.contains(active)) return
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      const files = event.clipboardData?.files
      if (files === undefined || files.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      uploadFiles(files, pasteDir ?? root)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [pasteDir, root, sessionId])

  // Keep the (taller) context menu inside the viewport once it has laid out.
  useLayoutEffect(() => {
    const el = menuRef.current
    if (el === null || menu === null) return
    const rect = el.getBoundingClientRect()
    if (rect.right > window.innerWidth) {
      el.style.left = `${Math.max(4, window.innerWidth - rect.width - 4)}px`
    }
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${Math.max(4, window.innerHeight - rect.height - 4)}px`
    }
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
      const isCut = clipboard?.mode === 'cut' && clipboard.path === entry.path
      const isRenaming = renaming !== null && renaming.path === entry.path
      const rowClass = [
        'df-row',
        selected === entry.path ? 'df-row-selected' : '',
        entry.hidden ? 'df-hidden' : '',
        isCut ? 'df-cut' : '',
        dragSource === entry.path ? 'df-dragging' : '',
        dragOver === entry.path ? 'df-drop-target' : '',
      ].filter(Boolean).join(' ')
      rows.push(createElement('div', {
        key: entry.path,
        className: rowClass,
        title: entry.path,
        draggable: !isRenaming,
        onClick: isRenaming ? undefined : () => {
          if (entry.isDir) setPasteDir(entry.path)
          toggle(entry)
        },
        onContextMenu: (event: MouseEvent) => {
          event.preventDefault()
          event.stopPropagation()
          setSelected(entry.path)
          if (entry.isDir) setPasteDir(entry.path)
          setMenu({
            x: event.clientX,
            y: event.clientY,
            target: { kind: entry.isDir ? 'dir' : 'file', path: entry.path },
          })
          if (entry.isDir) probeClipboardImage()
        },
        onDragStart: (event: DragEvent) => {
          const dt = event.dataTransfer
          if (dt === null) return
          dt.setData('application/x-dock-files', entry.path)
          dt.setData('text/plain', `dock-files:${entry.path}`)
          dt.effectAllowed = 'move'
          setDragSource(entry.path)
        },
        onDragEnd: () => {
          setDragSource(null)
          setDragOver(null)
        },
        // Every row is a drop target: onto a directory the entry moves /
        // imports into it; onto a file it moves / imports into that file's
        // parent directory — so an imprecise drop on a sibling still lands
        // somewhere useful. Dropping an entry onto itself is ignored.
        onDragEnter: (event: DragEvent) => {
          if (dragSource === entry.path) return
          event.preventDefault()
          setDragOver(entry.path)
        },
        onDragOver: (event: DragEvent) => {
          if (dragSource === entry.path) return
          event.preventDefault()
          if (event.dataTransfer !== null) {
            event.dataTransfer.dropEffect = event.dataTransfer.files.length > 0 ? 'copy' : 'move'
          }
        },
        onDragLeave: () => setDragOver((previous) => (previous === entry.path ? null : previous)),
        onDrop: (event: DragEvent) => {
          event.preventDefault()
          event.stopPropagation()
          setDragOver(null)
          if (dragSource === entry.path) return
          const dest = entry.isDir ? entry.path : parentPathOf(entry.path)
          if (dest !== null) handleDrop(event, dest)
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
        isRenaming
          ? createElement('input', {
            key: 'rename',
            className: 'df-rename-input',
            value: renaming!.value,
            autoFocus: true,
            onFocus: (event: FocusEvent) => {
              // Preselect the name (basename without extension), like VSCode.
              const el = event.target as HTMLInputElement
              const dot = el.value.lastIndexOf('.')
              el.setSelectionRange(0, dot > 0 ? dot : el.value.length)
            },
            onChange: (event: Event) => {
              setRenaming({ path: entry.path, value: (event.target as HTMLInputElement).value })
            },
            onKeyDown: (event: KeyboardEvent) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitRename()
              } else if (event.key === 'Escape') {
                cancelRename()
              }
            },
            onBlur: commitRename,
            onClick: (event: MouseEvent) => event.stopPropagation(),
            onDoubleClick: (event: MouseEvent) => event.stopPropagation(),
            onContextMenu: (event: MouseEvent) => event.stopPropagation(),
          })
          : createElement('span', { className: 'df-name' }, entry.name),
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

  // Context menu (independent of the dock shell's own menu). Items use the
  // .df-context-menu-item class for hover/active feedback and fire once on
  // click (mutations are not idempotent, unlike the old refresh/copy). A
  // full-screen backdrop below the menu closes it on outside click.
  const menuItem = (
    key: string,
    icon: ReactNode,
    label: string,
    action?: () => void,
    disabled = false,
  ): ReactNode =>
    createElement('div', {
      key,
      className: `df-context-menu-item${disabled ? ' df-context-menu-item-disabled' : ''}`,
      ...(disabled || action === undefined ? {} : { onClick: action }),
    }, icon, createElement('span', null, label))

  const separator = (key: string): ReactNode =>
    createElement('div', { key, className: 'df-context-menu-sep' })

  const buildMenuItems = (): ReactNode[] => {
    if (menu === null) return []
    const target = menu.target
    // The "paste image" item only shows when the clipboard probe found an image.
    const pasteImageItem = (dest: string): ReactNode[] =>
      imageProbe === 'has'
        ? [menuItem('paste-image', imageIcon(13), '粘贴图片', () => pasteImageInto(dest))]
        : []
    if (target.kind === 'empty') {
      if (root === null) return []
      const label = clipboard === null ? '粘贴' : `粘贴 ${baseNameOf(clipboard.path)}`
      return [
        menuItem('new-file', plusIcon(13), '新建文件', () => startCreate('file', root)),
        menuItem('new-dir', newFolderIcon(13), '新建文件夹', () => startCreate('dir', root)),
        separator('s1'),
        menuItem('paste', pasteIcon(13), label, () => pasteInto(root), clipboard === null),
        ...pasteImageItem(root),
        separator('s2'),
        menuItem('refresh', refreshIcon(13), '刷新', () => void load()),
      ]
    }
    const path = target.path as string
    if (target.kind === 'dir') {
      const pasteLabel = clipboard === null ? '粘贴' : `粘贴 ${baseNameOf(clipboard.path)}`
      return [
        menuItem('new-file', plusIcon(13), '新建文件', () => startCreate('file', path)),
        menuItem('new-dir', newFolderIcon(13), '新建文件夹', () => startCreate('dir', path)),
        separator('s1'),
        menuItem('refresh', refreshIcon(13), '刷新', () => refreshDir(path)),
        menuItem('rename', editIcon(13), '重命名', () => beginRename(path)),
        menuItem('copy', copyIcon(13), '复制', () => setClip('copy', path)),
        menuItem('cut', cutIcon(13), '剪切', () => setClip('cut', path)),
        menuItem('paste', pasteIcon(13), pasteLabel, () => pasteInto(path), clipboard === null),
        ...pasteImageItem(path),
        separator('s2'),
        menuItem('delete', trashIcon(13), '删除', () => removePath(path)),
        menuItem('copy-path', copyIcon(13), '复制路径', () => copyPath(path)),
      ]
    }
    return [
      menuItem('open', openIcon(13), '打开', () => openFile(path)),
      separator('s1'),
      menuItem('rename', editIcon(13), '重命名', () => beginRename(path)),
      menuItem('copy', copyIcon(13), '复制', () => setClip('copy', path)),
      menuItem('cut', cutIcon(13), '剪切', () => setClip('cut', path)),
      separator('s2'),
      menuItem('delete', trashIcon(13), '删除', () => removePath(path)),
      menuItem('copy-path', copyIcon(13), '复制路径', () => copyPath(path)),
    ]
  }

  const menuEl = menu === null ? null : createElement(Fragment, null,
    createElement('div', {
      className: 'df-context-backdrop',
      onMouseDown: () => setMenu(null),
      onContextMenu: (event: MouseEvent) => event.preventDefault(),
    }),
    createElement('div', {
      ref: menuRef,
      className: 'df-context-menu',
      style: { left: menu.x, top: menu.y },
      onMouseDown: (event: MouseEvent) => event.stopPropagation(),
      onContextMenu: (event: MouseEvent) => event.preventDefault(),
    }, ...buildMenuItems()),
  )

  // Themed dialog (replaces native confirm/alert): backdrop click cancels,
  // the confirm button is auto-focused, Esc closes.
  const dialogEl = dialog === null ? null : createElement(Fragment, null,
    createElement('div', {
      className: 'df-dialog-backdrop',
      onMouseDown: () => setDialog(null),
      onContextMenu: (event: MouseEvent) => event.preventDefault(),
    }),
    createElement('div', {
      className: 'df-dialog',
      role: 'dialog',
      'aria-modal': true,
      onMouseDown: (event: MouseEvent) => event.stopPropagation(),
    },
      createElement('div', { className: 'df-dialog-body' }, dialog.message),
      createElement('div', { className: 'df-dialog-actions' },
        dialog.kind === 'confirm'
          ? [
            createElement('button', {
              key: 'cancel',
              className: 'df-dialog-btn',
              onClick: () => setDialog(null),
            }, '取消'),
            createElement('button', {
              key: 'confirm',
              className: `df-dialog-btn df-dialog-btn-primary${dialog.danger === true ? ' df-dialog-btn-danger' : ''}`,
              autoFocus: true,
              onClick: () => {
                const action = dialog.onConfirm
                setDialog(null)
                action?.()
              },
            }, dialog.confirmLabel ?? '确定'),
          ]
          : [
            createElement('button', {
              key: 'ok',
              className: 'df-dialog-btn df-dialog-btn-primary',
              autoFocus: true,
              onClick: () => setDialog(null),
            }, '确定'),
          ],
      ),
    ),
  )

  const rows = renderLevel(entries, 0, [])

  return createElement('div', {
    ref: viewRef,
    className: 'df-view',
    tabIndex: 0,
    // Focus the panel so Ctrl+V pastes OS-copied files into it; leave
    // text fields (the inline rename box) focused.
    onMouseDown: (event: MouseEvent) => {
      const target = event.target as Node | null
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      if (document.activeElement !== viewRef.current) viewRef.current?.focus()
    },
  },
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
    createElement('div', {
      className: `df-tree${dragOver === root && root !== null ? ' df-drop-target' : ''}`,
      // Right-click on the empty area: root-level actions (new / paste).
      onContextMenu: (event: MouseEvent) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        setPasteDir(null)
        setMenu({ x: event.clientX, y: event.clientY, target: { kind: 'empty' } })
        probeClipboardImage()
      },
      // The empty area is also a drop target for the root directory.
      onDragEnter: (event: DragEvent) => {
        if (event.target !== event.currentTarget || root === null) return
        event.preventDefault()
        setDragOver(root)
      },
      onDragOver: (event: DragEvent) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        if (event.dataTransfer !== null) {
          event.dataTransfer.dropEffect = event.dataTransfer.files.length > 0 ? 'copy' : 'move'
        }
      },
      onDragLeave: (event: DragEvent) => {
        if (event.target !== event.currentTarget) return
        setDragOver((previous) => (previous === root ? null : previous))
      },
      onDrop: (event: DragEvent) => {
        if (event.target !== event.currentTarget || root === null) return
        event.preventDefault()
        setDragOver(null)
        handleDrop(event, root)
      },
    },
      ...(entries.length === 0
        ? [createElement('div', {
          key: 'empty',
          className: 'df-empty',
          onContextMenu: (event: MouseEvent) => {
            event.preventDefault()
            event.stopPropagation()
            setPasteDir(null)
            setMenu({ x: event.clientX, y: event.clientY, target: { kind: 'empty' } })
            probeClipboardImage()
          },
          onDragEnter: (event: DragEvent) => {
            event.preventDefault()
            event.stopPropagation()
            if (root !== null) setDragOver(root)
          },
          onDragOver: (event: DragEvent) => {
            event.preventDefault()
            event.stopPropagation()
            if (event.dataTransfer !== null) {
              event.dataTransfer.dropEffect = event.dataTransfer.files.length > 0 ? 'copy' : 'move'
            }
          },
          onDrop: (event: DragEvent) => {
            event.preventDefault()
            event.stopPropagation()
            setDragOver(null)
            if (root !== null) handleDrop(event, root)
          },
        }, '空目录')]
        : rows),
    ),
    // 1px upload progress bar pinned to the panel's bottom edge.
    ...(uploading
      ? [createElement('div', { key: 'progress', className: 'df-progress' },
        createElement('div', {
          className: 'df-progress-fill',
          style: { width: `${Math.round(uploadProgress * 100)}%` },
        }))]
      : []),
    // Portal to <body>: a transform on an ancestor (dock-mode floating panel)
    // would otherwise turn the menu's fixed coordinates into panel-relative
    // ones and render it off-screen.
    menuEl !== null ? createPortal(menuEl, document.body) : null,
    dialogEl !== null ? createPortal(dialogEl, document.body) : null,
  )
}
