/**
 * Unit tests for the Harness drop-conflict bridge: destination mapping, the
 * drag filter, and the overlay fade in/out + dismissal behaviour (including
 * fast direction reversal, which must not restart or double-schedule).
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  carriesFiles,
  dismissHarnessDropOverlay,
  dropDestinationOf,
  fadeHarnessDropOverlayIn,
  fadeHarnessDropOverlayOut,
  parentPathOf,
} from '../src/client/dropBridge.ts'

interface FakeOverlay {
  getAttribute: (name: string) => string | null
  style: Record<string, string>
  offsetWidth: number
  isConnected: boolean
}

/** Minimal DataTransfer stand-in: only `types` is read by the bridge. */
function transfer(types: string[]): DataTransfer {
  return { types } as unknown as DataTransfer
}

/** A row element stand-in exposing the two data attributes the bridge reads. */
function row(path: string, isDir: boolean): Element {
  return {
    closest(selector: string) {
      return selector === '[data-df-path]' ? this : null
    },
    getAttribute(name: string) {
      if (name === 'data-df-path') return path
      if (name === 'data-df-dir') return isDir ? '1' : null
      return null
    },
  } as unknown as Element
}

/** A Harness overlay stand-in: styles, offsetWidth and connection state. */
function overlay(): FakeOverlay {
  return {
    getAttribute: (name: string) => (name === 'role' ? 'status' : null),
    style: { transition: '', opacity: '' },
    offsetWidth: 0,
    isConnected: true,
  }
}

/** Install the globals a browser would provide; returns a restore function. */
function stubBrowser(children: unknown[], box: { position: string; pointerEvents: string; zIndex: string }): () => void {
  const globals = globalThis as unknown as Record<string, unknown>
  const saved = {
    document: globals.document,
    getComputedStyle: globals.getComputedStyle,
    DataTransfer: globals.DataTransfer,
    DragEvent: globals.DragEvent,
    File: globals.File,
  }
  globals.document = {
    body: { children },
    documentElement: { dispatchEvent: () => true },
  }
  globals.getComputedStyle = () => box
  return () => {
    globals.document = saved.document
    globals.getComputedStyle = saved.getComputedStyle
    globals.DataTransfer = saved.DataTransfer
    globals.DragEvent = saved.DragEvent
    globals.File = saved.File
    // Reset the module's fade state without touching the stubbed document
    // (the globals are already gone, so this only clears bookkeeping).
    dismissHarnessDropOverlay()
  }
}

const OVERLAY_BOX = { position: 'fixed', pointerEvents: 'none', zIndex: '1000' }

test('parentPathOf handles unix, windows and root paths', () => {
  assert.equal(parentPathOf('/w/a.txt'), '/w')
  assert.equal(parentPathOf('C:\\w\\a.txt'), 'C:\\w')
  assert.equal(parentPathOf('a.txt'), null)
  assert.equal(parentPathOf('/a.txt'), '/')
})

test('carriesFiles only accepts OS-file drags', () => {
  assert.equal(carriesFiles(null), false)
  assert.equal(carriesFiles(undefined), false)
  assert.equal(carriesFiles(transfer([])), false)
  assert.equal(carriesFiles(transfer(['text/plain'])), false)
  assert.equal(carriesFiles(transfer(['application/x-dock-files'])), false)
  assert.equal(carriesFiles(transfer(['Files'])), true)
  assert.equal(carriesFiles(transfer(['text/plain', 'Files'])), true)
})

test('dropDestinationOf imports into a directory row', () => {
  const target = row('/w/dir', true) as unknown as EventTarget
  assert.deepEqual(dropDestinationOf(target, '/w'), { dest: '/w/dir', highlight: '/w/dir' })
})

test('dropDestinationOf imports a file row into its parent', () => {
  const target = row('/w/dir/file.txt', false) as unknown as EventTarget
  assert.deepEqual(dropDestinationOf(target, '/w'), { dest: '/w/dir', highlight: '/w/dir/file.txt' })
})

test('dropDestinationOf falls back to the root for empty areas', () => {
  const empty = { closest: () => null } as unknown as EventTarget
  assert.deepEqual(dropDestinationOf(empty, '/w'), { dest: '/w', highlight: '/w' })
  assert.deepEqual(dropDestinationOf(null, '/w'), { dest: '/w', highlight: '/w' })
})

test('fadeHarnessDropOverlayOut eases the Harness overlay to transparent', () => {
  const element = overlay()
  const restore = stubBrowser([element], OVERLAY_BOX)
  try {
    fadeHarnessDropOverlayOut()
    assert.equal(element.style.opacity, '0')
    assert.match(element.style.transition, /opacity 160ms ease-out/)
    // Repeating the same direction must not restart the curve.
    fadeHarnessDropOverlayOut()
    assert.equal(element.style.opacity, '0')
  } finally {
    restore()
  }
})

test('fast out/in/out reversals leave the overlay transparent and never snap it', async () => {
  const element = overlay()
  const restore = stubBrowser([element], OVERLAY_BOX)
  try {
    fadeHarnessDropOverlayOut()
    fadeHarnessDropOverlayIn()
    fadeHarnessDropOverlayOut()
    assert.equal(element.style.opacity, '0')
    // The fade-in scheduled a style cleanup; the reversal must cancel it, or it
    // would clear the inline opacity mid-fade and flash the overlay.
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal(element.style.opacity, '0')
  } finally {
    restore()
  }
})

test('a remounted overlay is targeted again, not the stale node', () => {
  const first = overlay()
  const restore = stubBrowser([first], OVERLAY_BOX)
  try {
    fadeHarnessDropOverlayOut()
    assert.equal(first.style.opacity, '0')
    // The Harness unmounted and remounted the overlay while the drag continued.
    first.isConnected = false
    const second = overlay()
    ;(globalThis.document as unknown as { body: { children: unknown[] } }).body.children = [second]
    fadeHarnessDropOverlayOut()
    assert.equal(second.style.opacity, '0')
    assert.equal(second.style.transition !== '', true)
  } finally {
    restore()
  }
})

test('fadeHarnessDropOverlayOut falls back to the counter reset without an overlay', () => {
  let dispatched = 0
  const restore = stubBrowser([], OVERLAY_BOX)
  const globals = globalThis as unknown as Record<string, unknown>
  globals.DataTransfer = class { items = { add: () => undefined } }
  globals.DragEvent = class { type: string; constructor(type: string) { this.type = type } }
  globals.File = class {}
  ;(globalThis.document as unknown as { documentElement: { dispatchEvent: () => boolean } }).documentElement.dispatchEvent = () => {
    dispatched += 1
    return true
  }
  try {
    fadeHarnessDropOverlayOut()
  } finally {
    restore()
  }
  assert.equal(dispatched, 1)
})

test('dismissHarnessDropOverlay cancels a pending fade-in cleanup', async () => {
  const element = overlay()
  const restore = stubBrowser([element], OVERLAY_BOX)
  try {
    fadeHarnessDropOverlayOut()
    fadeHarnessDropOverlayIn()
    dismissHarnessDropOverlay()
    await new Promise((resolve) => setTimeout(resolve, 300))
    // The cleanup timer must have been cancelled with the dismissal.
    assert.notEqual(element.style.transition, '')
  } finally {
    restore()
  }
})

test('dismissHarnessDropOverlay dispatches one document-level file dragleave', () => {
  const dispatched: Array<{ type: string; bubbles: boolean; clientX: number; hasFile: boolean }> = []
  class FakeDataTransfer {
    items = { add: () => undefined }
  }
  class FakeFile {}
  class FakeDragEvent {
    type: string
    bubbles: boolean
    clientX: number
    clientY: number
    dataTransfer: { types: string[] }
    constructor(type: string, init: { bubbles?: boolean; clientX?: number; clientY?: number }) {
      this.type = type
      this.bubbles = init.bubbles === true
      this.clientX = init.clientX ?? 0
      this.clientY = init.clientY ?? 0
      this.dataTransfer = { types: ['Files'] }
    }
  }
  const element = {
    dispatchEvent(event: FakeDragEvent): boolean {
      dispatched.push({
        type: event.type,
        bubbles: event.bubbles,
        clientX: event.clientX,
        hasFile: event.dataTransfer.types.includes('Files'),
      })
      return true
    },
  }
  const globals = globalThis as unknown as Record<string, unknown>
  const saved = { DataTransfer: globals.DataTransfer, DragEvent: globals.DragEvent, File: globals.File, document: globals.document }
  globals.DataTransfer = FakeDataTransfer
  globals.DragEvent = FakeDragEvent
  globals.File = FakeFile
  globals.document = { documentElement: element }
  try {
    dismissHarnessDropOverlay()
  } finally {
    globals.DataTransfer = saved.DataTransfer
    globals.DragEvent = saved.DragEvent
    globals.File = saved.File
    globals.document = saved.document
  }
  assert.equal(dispatched.length, 1)
  assert.equal(dispatched[0].type, 'dragleave')
  assert.equal(dispatched[0].bubbles, true)
  assert.equal(dispatched[0].clientX, 0)
  assert.equal(dispatched[0].hasFile, true)
})
