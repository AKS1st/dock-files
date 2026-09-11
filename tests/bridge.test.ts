import test from 'node:test'
import assert from 'node:assert/strict'
import { bridgeChatOpens, createOpenPathBridgeController, sessionResourceAddress } from '../src/client/openBridge.ts'
import { OPEN_SOURCE_SETTING } from '../src/client/setting.ts'

test('open-source setting keeps dock/harness radio values', () => {
  assert.equal(OPEN_SOURCE_SETTING.defaultValue, 'dock')
  assert.equal(OPEN_SOURCE_SETTING.validate('dock'), true)
  assert.equal(OPEN_SOURCE_SETTING.validate('harness'), true)
  assert.equal(OPEN_SOURCE_SETTING.validate('native'), false)
})

function sessions(cwd = '/workspace/root') {
  return { list: { getSnapshot: () => ({ current: 'session #1', byId: { 'session #1': { cwd } } }) } }
}

function resource(address: string) {
  const calls: { address: string; options?: unknown }[] = []
  const sidebar = { openResource: (value: string, options?: unknown) => { calls.push({ address: value, options }) } }
  return { sidebar, calls }
}

test('harness mode does not wrap the canonical carrier', async () => {
  const { sidebar, calls } = resource('')
  const original = sidebar.openResource
  const restore = bridgeChatOpens(sidebar, { openPath: () => undefined } as never, { canOpen: () => true } as never, 'harness', sessions())
  assert.equal(sidebar.openResource, original)
  const options = { source: 'chat' }
  sidebar.openResource('dsh-resource://file/session/session%20%231/a.ts', options)
  assert.deepEqual(calls, [{ address: 'dsh-resource://file/session/session%20%231/a.ts', options }])
  restore()
})

test('dock wraps sidebarRight and routes session resources to Workbench', async () => {
  const { sidebar, calls } = resource('')
  const opened: string[] = []
  const oldFetch = globalThis.fetch
  globalThis.fetch = async (_input, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { path: '/workspace/root/folder name/a#b?.ts' })
    return new Response(JSON.stringify({ ok: true, value: { exists: true, isDir: false } }))
  }
  try {
    const restore = bridgeChatOpens(sidebar, { openPath: (path: string) => opened.push(path) } as never, { canOpen: () => true } as never, 'dock', sessions())
    const options = { source: 'chat' }
    await sidebar.openResource('dsh-resource://file/session/session%20%231/folder%20name/a%23b%3F.ts', options)
    assert.deepEqual(opened, ['/workspace/root/folder name/a#b?.ts'])
    assert.deepEqual(calls, [])
    restore()
  } finally { globalThis.fetch = oldFetch }
})

test('session and absolute addresses decode per segment; fallback preserves options', async () => {
  const { sidebar, calls } = resource('')
  const oldFetch = globalThis.fetch
  const probed: string[] = []
  globalThis.fetch = async (_input, init) => {
    const path = JSON.parse(String(init?.body)).path as string
    probed.push(path)
    return new Response(JSON.stringify({ ok: true, value: { exists: false, isDir: false } }))
  }
  try {
    const restore = bridgeChatOpens(sidebar, { openPath: () => undefined } as never, { canOpen: () => true } as never, 'dock', sessions())
    const options = { from: 'test' }
    await sidebar.openResource('dsh-resource://file/absolute/tmp/a%20b.txt', options)
    await sidebar.openResource('dsh-resource://file/session/session%20%231/a%20b.txt', options)
    await sidebar.openResource('other://thing', options)
    assert.deepEqual(probed, ['/tmp/a b.txt', '/workspace/root/a b.txt'])
    assert.deepEqual(calls, [
      { address: 'dsh-resource://file/absolute/tmp/a%20b.txt', options },
      { address: 'dsh-resource://file/session/session%20%231/a%20b.txt', options },
      { address: 'other://thing', options },
    ])
    restore()
  } finally { globalThis.fetch = oldFetch }
})

test('resource address builder uses b67 per-segment encoding', () => {
  assert.equal(sessionResourceAddress('s #1', '/workspace', '/workspace/folder name/a#b?.ts'), 'dsh-resource://file/session/s%20%231/folder%20name/a%23b%3F.ts')
  assert.equal(sessionResourceAddress('s', '/workspace', '/tmp/a b.txt'), 'dsh-resource://file/absolute/tmp/a%20b.txt')
})

test('stale probe cannot route Workbench after mode switch or dispose', async () => {
  const { sidebar, calls } = resource('')
  const opened: string[] = []
  const oldFetch = globalThis.fetch
  let resolveFetch!: (response: Response) => void
  globalThis.fetch = async () => await new Promise<Response>((resolve) => { resolveFetch = resolve })
  let mode: 'dock' | 'harness' = 'dock'
  try {
    const controller = createOpenPathBridgeController(() => mode, (mounted, installedMode) => bridgeChatOpens(mounted, { openPath: (path: string) => opened.push(path) } as never, { canOpen: () => true } as never, installedMode, sessions()))
    controller.mount(sidebar)
    const pending = sidebar.openResource('dsh-resource://file/session/session%20%231/a.ts', { stale: true })
    mode = 'harness'; controller.sync()
    resolveFetch(new Response(JSON.stringify({ ok: true, value: { exists: true, isDir: false } })))
    await pending
    assert.deepEqual(opened, [])
    assert.equal(calls.length, 1)
    controller.dispose()
  } finally { globalThis.fetch = oldFetch }
})

test('controller mounts sidebarRight late and disposes wrapper', () => {
  const { sidebar } = resource('')
  let installs = 0
  const controller = createOpenPathBridgeController(() => 'harness', (_service, mode) => { installs++; assert.equal(mode, 'harness'); return () => undefined })
  controller.sync()
  controller.mount(sidebar)
  assert.equal(installs, 1)
  controller.dispose()
  controller.mount(sidebar)
  assert.equal(installs, 1)
})

test('dock mode without sessions leaves the native openResource unchanged', () => {
  const { sidebar, calls } = resource('')
  const original = sidebar.openResource
  const restore = bridgeChatOpens(sidebar, { openPath: () => undefined } as never, { canOpen: () => true } as never, 'dock')
  assert.equal(sidebar.openResource, original)
  sidebar.openResource('dsh-resource://file/absolute/tmp/a.txt', { source: 'chat' })
  assert.deepEqual(calls, [{ address: 'dsh-resource://file/absolute/tmp/a.txt', options: { source: 'chat' } }])
  restore()
})

test('controller reinstalls dock bridge when sessions arrive late', async () => {
  const { sidebar, calls } = resource('')
  const original = sidebar.openResource
  const opened: string[] = []
  let currentSessions: ReturnType<typeof sessions> | undefined
  const oldFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, value: { exists: true, isDir: false } }))
  try {
    const controller = createOpenPathBridgeController(() => 'dock', (mounted, mode) => bridgeChatOpens(mounted, { openPath: (path: string) => opened.push(path) } as never, { canOpen: () => true } as never, mode, currentSessions))
    controller.mount(sidebar)
    assert.equal(sidebar.openResource, original)
    currentSessions = sessions()
    controller.sync()
    await sidebar.openResource('dsh-resource://file/session/session%20%231/a.ts')
    assert.deepEqual(opened, ['/workspace/root/a.ts'])
    assert.deepEqual(calls, [])
    controller.dispose()
    assert.equal(sidebar.openResource, original)
  } finally { globalThis.fetch = oldFetch }
})
