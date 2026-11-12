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

/** Duration to match the Harness overlay's own 0.16s ease-out fade-in. */
const OVERLAY_FADE_MS = 160

/** Quiet period after a fade-in before its inline transition styles are cleared. */
const OVERLAY_SETTLE_MS = 60

/** The Harness overlay element this bridge currently drives, if any. */
let fadedOverlay: HTMLElement | null = null

/** The opacity that element is heading to, so repeated calls do not restart it. */
let intendedOpacity: '0' | '1' | null = null

/** Pending cleanup of the inline transition styles after a fade-in. */
let settleTimer: ReturnType<typeof setTimeout> | null = null

function cancelSettle(): void {
  if (settleTimer !== null) {
    clearTimeout(settleTimer)
    settleTimer = null
  }
}

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
 * The Harness's drop overlay, found by the shape it paints: a `role="status"`
 * portal on `document.body` that is fixed, full-bleed, `pointer-events: none`
 * and above the workbench (z-index 1000). Matching on painted shape rather
 * than a hashed CSS-module class keeps this working across Harness rebuilds.
 */
function findHarnessDropOverlay(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const body = document.body
  if (body === null || body === undefined) return null
  const computed = typeof getComputedStyle === 'function' ? getComputedStyle : undefined
  for (const element of Array.from(body.children as unknown as HTMLElement[])) {
    if (element === null || typeof element.getAttribute !== 'function') continue
    if (element.getAttribute('role') !== 'status') continue
    if (computed === undefined) return element
    const style = computed(element)
    if (style.position === 'fixed' && style.pointerEvents === 'none' && style.zIndex === '1000') return element
  }
  return null
}

/**
 * The overlay to drive: the one still mounted, else a freshly painted one (the
 * Harness unmounts and remounts this component as its drag state toggles, so a
 * cached node can be stale).
 */
function overlayForTransition(): HTMLElement | null {
  if (fadedOverlay !== null && fadedOverlay.isConnected === true) return fadedOverlay
  const found = findHarnessDropOverlay()
  fadedOverlay = found
  if (found !== null) intendedOpacity = null
  return found
}

/**
 * Dispatch the one event the Harness's drop counters reset on: a document-level
 * `dragleave` whose pointer sits outside the viewport. A constructible
 * `DataTransfer` carrying a file is required for the Harness's own filter to
 * recognise it as a file drag.
 */
export function dismissHarnessDropOverlay(): void {
  cancelSettle()
  fadedOverlay = null
  intendedOpacity = null
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
export function fadeHarnessDropOverlayOut(): void {
  cancelSettle()
  const overlay = overlayForTransition()
  if (overlay === null) {
    dismissHarnessDropOverlay()
    return
  }
  if (intendedOpacity === '0') return
  intendedOpacity = '0'
  overlay.style.transition = `opacity ${OVERLAY_FADE_MS}ms ease-out`
  // Flush once per direction change so the transition has a value to leave
  // from; repeated calls never reach this line.
  void overlay.offsetWidth
  overlay.style.opacity = '0'
}

/**
 * Fade a previously faded overlay back in, cancelling a pending style cleanup
 * first so a late timer can never snap it to full opacity mid-transition.
 */
export function fadeHarnessDropOverlayIn(): void {
  cancelSettle()
  const overlay = fadedOverlay
  if (overlay === null || overlay.isConnected !== true) {
    fadedOverlay = null
    intendedOpacity = null
    return
  }
  if (intendedOpacity === '1') return
  intendedOpacity = '1'
  overlay.style.transition = `opacity ${OVERLAY_FADE_MS}ms ease-out`
  void overlay.offsetWidth
  overlay.style.opacity = '1'
  settleTimer = setTimeout(() => {
    settleTimer = null
    intendedOpacity = null
    if (overlay.isConnected === true) {
      overlay.style.transition = ''
      overlay.style.opacity = ''
    }
  }, OVERLAY_FADE_MS + OVERLAY_SETTLE_MS)
}
