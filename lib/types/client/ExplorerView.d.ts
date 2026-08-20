/**
 * Pure file browser: a lazy recursive directory tree over the active
 * session's working directory (own /wb-files host route). Clicking a file
 * dispatches through the file-domain service (`ctx.files.open`) to a
 * registered file viewer (dock-editor) — this view never renders file
 * content itself.
 */
import { type ReactNode } from 'react';
import type { ViewProps } from './contract.ts';
export declare function ExplorerView(props: ViewProps): ReactNode;
