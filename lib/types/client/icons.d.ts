import type { ReactNode } from 'react';
import type { FileTypeIcon } from './index';
/** Per-type tint for a file name (dotfiles and unknown types fall back to gray). */
export declare function fileColor(name: string): string;
/** Folder glyph: closed (theme tint) or open. */
export declare function folderIcon(open: boolean, size?: number): ReactNode;
/**
 * Per-type file glyph with the full precedence: a registered extension-matched
 * `extIcon` wins outright; otherwise the built-in per-type palette; otherwise
 * the default viewer's `fallbackIcon`; otherwise the generic gray. A custom
 * `path` (ext icon first, then the default icon for palette-unknown types)
 * replaces the generic document silhouette.
 */
export declare function fileIcon(name: string, extIcon?: FileTypeIcon, fallbackIcon?: FileTypeIcon, size?: number): ReactNode;
/** Tree expand arrow (rotate 90° via CSS for the open state). */
export declare function treeArrow(size?: number): ReactNode;
/** Tree guide "L" connector (8×10, tinted by the row's CSS color). */
export declare function treeCorner(size?: number): ReactNode;
export declare function refreshIcon(size?: number, className?: string): ReactNode;
export declare function copyIcon(size?: number): ReactNode;
export declare function plusIcon(size?: number): ReactNode;
export declare function editIcon(size?: number): ReactNode;
export declare function trashIcon(size?: number): ReactNode;
/** Open arrow (points up-right). */
export declare function openIcon(size?: number): ReactNode;
export declare function cutIcon(size?: number): ReactNode;
export declare function pasteIcon(size?: number): ReactNode;
export declare function newFolderIcon(size?: number): ReactNode;
/** Picture frame — paste a clipboard image. */
export declare function imageIcon(size?: number): ReactNode;
/** Open loading ring; consumers spin it with the .df-spin class. */
export declare function loadingIcon(size?: number, className?: string): ReactNode;
export declare function warningIcon(size?: number): ReactNode;
export declare function chevronUpIcon(size?: number): ReactNode;
