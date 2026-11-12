/**
 * Drop-conflict bridge between this panel and the Harness.
 *
 * The Harness installs document-level file-drop listeners: any drag carrying
 * OS files paints a full-screen "drop files here" overlay and appends the
 * dropped files to the composer. While the pointer is over this panel those
 * listeners must not run — this panel owns the drop — so the view stops the
 * drag events in the capture phase, before they reach `document`, and eases an
 * overlay the Harness already painted out of the way instead of snapping it
 * off, so entering and leaving the panel keeps the Harness's own transition.
 *
 * The pure parts live here so they can be tested without rendering React.
 */
/** Whether a drag carries OS files, the only kind the Harness acts on. */
export declare function carriesFiles(transfer: DataTransfer | null | undefined): boolean;
/** Parent directory of a path, or null at the filesystem root. */
export declare function parentPathOf(path: string): string | null;
/**
 * Where a drop lands: onto a directory row it imports into that directory,
 * onto a file row into its parent (so an imprecise drop still lands somewhere
 * useful), and onto the empty area into the root directory.
 *
 * `highlight` is the row to mark, which is the row itself even for files —
 * mirroring the feedback the internal drag already had.
 */
export declare function dropDestinationOf(target: EventTarget | null, root: string | null): {
    dest: string | null;
    highlight: string | null;
};
/**
 * Dispatch the one event the Harness's drop counters reset on: a document-level
 * `dragleave` whose pointer sits outside the viewport. A constructible
 * `DataTransfer` carrying a file is required for the Harness's own filter to
 * recognise it as a file drag.
 */
export declare function dismissHarnessDropOverlay(): void;
/**
 * Ease the Harness overlay out while the pointer is inside the panel.
 *
 * The overlay is React state owned by the Harness, so it cannot be faded by
 * waiting for its own transition — dismissing it would unmount it at once.
 * Instead it is kept mounted and faded with the same 0.16s `ease-out` curve the
 * Harness uses on the way in; leaving the panel fades it back in place.
 *
 * The call is idempotent for the direction already running: a fast pass back
 * and forth across the panel edge reverses the existing transition from its
 * current opacity instead of restarting it, which is what flickered. When no
 * overlay is on screen (the common case, because the panel stopped the Harness
 * from ever arming) there is nothing to animate and armed counters are reset.
 */
export declare function fadeHarnessDropOverlayOut(): void;
/**
 * Fade a previously faded overlay back in, cancelling a pending style cleanup
 * first so a late timer can never snap it to full opacity mid-transition.
 */
export declare function fadeHarnessDropOverlayIn(): void;
