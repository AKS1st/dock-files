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
 * inline rename), rename, copy / cut / paste, delete (confirmed), copy path,
 * refresh — plus an empty-area menu for the root directory. All glyphs are
 * the vendored harness ic_ds_* icon set (see ./icons.ts).
 */
import { type ReactNode } from 'react';
import type { ViewProps } from './contract.ts';
export declare function ExplorerView(props: ViewProps): ReactNode;
