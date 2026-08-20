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
import { type ReactNode } from 'react';
import type { ViewProps } from './contract.ts';
export declare function ExplorerView(props: ViewProps): ReactNode;
