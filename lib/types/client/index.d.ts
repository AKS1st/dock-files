import type { WorkbenchContext } from './contract.ts';
/** Requires the workbench base to be mounted. */
export declare const inject: string[];
/**
 * A file-type icon registered by a viewer and shown in the explorer for the
 * matching extensions. `color` tints the glyph; `path` replaces the generic
 * document silhouette with a custom SVG glyph (fill style, evenodd holes).
 */
export interface FileTypeIcon {
    /** Tint color (any CSS color). When absent the built-in per-type palette applies. */
    color?: string;
    /** Custom glyph: an SVG path `d` in a 16×16 viewBox (fill + evenodd holes). */
    path?: string;
    /** Override the glyph viewBox (default '0 0 16 16'). */
    viewBox?: string;
}
/** One registered file viewer (dock-editor registers itself here). */
interface FileViewerDef {
    id: string;
    /** Lowercase extensions without dots; [] or undefined = catch-all default. */
    exts?: string[];
    /** Catch-all fallback when no extension matches. */
    default?: boolean;
    /**
     * Explorer icon for this viewer's file types: extension-matched icons win
     * over the built-in palette; the default viewer's icon is the fallback for
     * types with no registered icon and no palette entry.
     */
    icon?: FileTypeIcon;
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
    /**
     * Resolve the registered explorer icon for a file name: the first viewer
     * whose extensions match and carries an icon, else undefined. The explorer
     * falls back to the built-in palette, then to `fallbackIcon()`, then to the
     * generic tint.
     */
    iconFor(name: string): FileTypeIcon | undefined;
    /**
     * The default viewer's registered icon — the explorer's fallback for file
     * types with no registered icon and no built-in palette entry.
     */
    fallbackIcon(): FileTypeIcon | undefined;
    /** Subscribe to viewer/icon registry changes (returns the disposer). */
    subscribe(listener: () => void): () => void;
    /** Monotonic registry version — the useSyncExternalStore snapshot. */
    getIconVersion(): number;
}
/** Client plugin body. */
export declare function apply(ctx: WorkbenchContext): void;
export {};
