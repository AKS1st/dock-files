/**
 * Unit tests for the Harness drop-conflict bridge: destination mapping, the
 * drag filter, and the overlay dismissal synthetic event.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { carriesFiles, dropDestinationOf, dismissHarnessDropOverlay, parentPathOf } from '../src/client/dropBridge.ts'

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
