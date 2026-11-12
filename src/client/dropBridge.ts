/**
 * Drop-conflict bridge between this panel and the Harness.
 *
 * The Harness installs document-level file-drop listeners: any drag carrying
 * OS files paints a full-screen "drop files here" overlay and appends the
 * dropped files to the composer. While the pointer is over this panel those
 * listeners must not run — this panel owns the drop — so the view stops the
 * drag events in the capture phase, before they reach `document`, and
 * dismisses an overlay the Harness already painted.
 *
 * The pure parts live here so they can be tested without rendering React.
 */

/** Whether a drag carries OS files, the only kind the Harness acts on. */
export function carriesFiles(transfer: DataTransfer | null | undefined): boolean {
  if (transfer === null || transfer === undefined) return false
  return Array.from(transfer.types).includes('Files')
}

/** Parent directory of a path, or null at the filesystem root. */
export function parentPathOf(path: string): string | null {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (at === -1) return null
  return at === 0 ? (path.startsWith('\\') ? '\\' : '/') : path.slice(0, at)
}

/**
 * Where a drop lands: onto a directory row it imports into that directory,
 * onto a file row into its parent (so an imprecise drop still lands somewhere
 * useful), and onto the empty area into the root directory.
 *
 * `highlight` is the row to mark, which is the row itself even for files —
 * mirroring the feedback the internal drag already had.
 */
export function dropDestinationOf(
  target: EventTarget | null,
  root: string | null,
): { dest: string | null; highlight: string | null } {
  const element = target as Element | null
  const row = element !== null && typeof element?.closest === 'function'
    ? element.closest('[data-df-path]')
    : null
  const path = row?.getAttribute('data-df-path') ?? null
  if (path === null) return { dest: root, highlight: root }
  return {
    dest: row?.getAttribute('data-df-dir') === '1' ? path : parentPathOf(path),
    highlight: path,
  }
}

/**
 * Dismiss a Harness drop overlay that was painted before the pointer reached
 * this panel.
 *
 * The overlay is component state driven by the Harness's own drag counters, so
 * the only way to clear it from outside is to give those listeners the event
 * they reset on: a dragleave whose target is the document root and whose
 * pointer sits outside the viewport. A constructible `DataTransfer` carrying a
 * file is required for the Harness's own filter to recognise it as a file
 * drag; an engine without one keeps the overlay for this drag, and the next
 * dragenter outside the panel restores it anyway.
 */
export function dismissHarnessDropOverlay(): void {
  if (typeof document === 'undefined') return
  if (typeof DataTransfer !== 'function' || typeof DragEvent !== 'function' || typeof File !== 'function') return
  try {
    const transfer = new DataTransfer()
    transfer.items.add(new File([], ''))
    document.documentElement.dispatchEvent(new DragEvent('dragleave', {
      bubbles: true,
      cancelable: true,
      clientX: 0,
      clientY: 0,
      dataTransfer: transfer,
    }))
  } catch {
    // Older engines without a constructible DataTransfer: the overlay stays
    // only for this drag, which the next dragenter outside the panel clears.
  }
}
