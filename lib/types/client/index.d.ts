import type { WorkbenchContext } from './contract.ts';
/** Requires the workbench base to be mounted. */
export declare const inject: string[];
/** One registered file viewer (dock-editor registers itself here). */
interface FileViewerDef {
    id: string;
    /** Lowercase extensions without dots; [] or undefined = catch-all default. */
    exts?: string[];
    /** Catch-all fallback when no extension matches. */
    default?: boolean;
}
/** The file-domain service dock-files provides as `ctx.files`. */
export interface FilesService {
    /** Open a file: dispatch to the matching viewer, carried by the workbench. */
    open(path: string, options?: {
        title?: string;
        mode?: 'tab' | 'floating';
    }): void;
    /** Register a file viewer (returns the disposer). */
    registerFileViewer(def: FileViewerDef): () => void;
}
/** Client plugin body. */
export declare function apply(ctx: WorkbenchContext): void;
export {};
