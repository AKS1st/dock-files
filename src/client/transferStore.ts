/**
 * Module-level, in-memory transfer task store shared by all Explorer views.
 * Tasks contain only serializable transfer state; payloads and host objects stay
 * with the caller and are accessed through the optional controller callbacks.
 */

export type TransferKind = 'upload' | 'download'
export type TransferStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped'

export interface TransferTask {
  id: string
  kind: TransferKind
  name: string
  sourcePath: string
  targetPath?: string
  sessionId?: string
  totalBytes: number
  transferredBytes: number
  speedBytesPerSecond: number
  status: TransferStatus
  error?: string
  createdAt: number
  updatedAt: number
}

export interface TransferController {
  start?: (task: TransferTask) => void | Promise<void>
  pause?: (task: TransferTask) => void | Promise<void>
  resume?: (task: TransferTask) => void | Promise<void>
  cancel?: (task: TransferTask) => void | Promise<void>
}

export interface CreateTransferTaskInput {
  kind: TransferKind
  name: string
  sourcePath: string
  targetPath?: string
  sessionId?: string
  totalBytes: number
  transferredBytes?: number
  controller?: TransferController
}

type MutableTaskFields = Pick<TransferTask, 'name' | 'sourcePath' | 'targetPath' | 'sessionId' | 'totalBytes' | 'transferredBytes' | 'status' | 'error'>
export type TransferTaskPatch = Partial<MutableTaskFields>

export interface TransferSnapshot {
  tasks: readonly TransferTask[]
  totalTransferred: number
  totalBytes: number
  activeCount: number
}

export type TransferListener = () => void

const TERMINAL: ReadonlySet<TransferStatus> = new Set(['completed', 'failed', 'cancelled', 'skipped'])
const MAX_TOTAL = Number.MAX_VALUE
const TRANSITIONS: Record<TransferStatus, ReadonlySet<TransferStatus>> = {
  queued: new Set(['running', 'paused', 'failed', 'cancelled']),
  running: new Set(['paused', 'completed', 'failed', 'cancelled', 'skipped']),
  paused: new Set(['running', 'failed', 'cancelled']),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
  skipped: new Set(),
}

const tasks = new Map<string, TransferTask>()
const controllers = new Map<string, TransferController>()
const operationTokens = new Map<string, number>()
const listeners = new Set<TransferListener>()
let sequence = 0
let snapshot: TransferSnapshot = makeSnapshot()

function finiteNonNegative(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function copyTask(task: TransferTask): TransferTask {
  return Object.freeze({ ...task })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function makeId(): string {
  sequence += 1
  return `transfer-${Date.now().toString(36)}-${sequence.toString(36)}`
}

function addToTotal(total: number, value: number): number {
  return total > MAX_TOTAL - value ? MAX_TOTAL : total + value
}

function makeSnapshot(): TransferSnapshot {
  const values = Array.from(tasks.values())
  let totalTransferred = 0
  let totalBytes = 0
  let activeCount = 0
  for (const task of values) {
    if (TERMINAL.has(task.status)) continue
    totalTransferred = addToTotal(totalTransferred, task.transferredBytes)
    totalBytes = addToTotal(totalBytes, task.totalBytes)
    activeCount += 1
  }
  return Object.freeze({
    tasks: Object.freeze(values),
    totalTransferred,
    totalBytes,
    activeCount,
  })
}

function notify(): void {
  snapshot = makeSnapshot()
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      // A subscriber must not prevent other subscribers from being notified.
    }
  }
}

function setStatus(id: string, status: TransferStatus): TransferTask | undefined {
  const current = tasks.get(id)
  if (current === undefined || current.status === status || !TRANSITIONS[current.status].has(status)) return current
  const next = copyTask({ ...current, status, updatedAt: Date.now() })
  tasks.set(id, next)
  // Keep the controller available until the in-flight lifecycle callback has
  // observed the terminal transition (cancel must still reach its abort hook).
  notify()
  return next
}

export function subscribe(listener: TransferListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot(): TransferSnapshot {
  return snapshot
}

export function getTotalProgress(): { totalTransferred: number; totalBytes: number } {
  return { totalTransferred: snapshot.totalTransferred, totalBytes: snapshot.totalBytes }
}

export function createTask(input: CreateTransferTaskInput): TransferTask {
  const now = Date.now()
  const task: TransferTask = {
    id: makeId(),
    kind: input.kind,
    name: input.name,
    sourcePath: input.sourcePath,
    ...(input.targetPath === undefined ? {} : { targetPath: input.targetPath }),
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
    totalBytes: finiteNonNegative(input.totalBytes),
    transferredBytes: Math.min(
      finiteNonNegative(input.transferredBytes),
      finiteNonNegative(input.totalBytes),
    ),
    speedBytesPerSecond: 0,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
  }
  const storedTask = copyTask(task)
  tasks.set(storedTask.id, storedTask)
  if (input.controller !== undefined) controllers.set(task.id, input.controller)
  notify()
  return copyTask(storedTask)
}

/** Alias emphasizing that this task is intended for a transfer pipeline. */
export const createTransferTask = createTask

export function updateTask(id: string, patch: TransferTaskPatch): TransferTask | undefined {
  const current = tasks.get(id)
  if (current === undefined || TERMINAL.has(current.status)) return current
  if (patch.status !== undefined && patch.status !== current.status && !TRANSITIONS[current.status].has(patch.status)) return current

  const totalBytes = patch.totalBytes === undefined
    ? current.totalBytes
    : finiteNonNegative(patch.totalBytes, Number.NaN)
  const transferredBytes = patch.transferredBytes === undefined
    ? current.transferredBytes
    : finiteNonNegative(patch.transferredBytes, Number.NaN)
  if (!Number.isFinite(totalBytes) || !Number.isFinite(transferredBytes)) return current

  const now = Date.now()
  const nextTransferredBytes = Math.min(transferredBytes, totalBytes)
  const elapsedMs = Math.max(1, now - current.updatedAt)
  const byteDelta = Math.max(0, nextTransferredBytes - current.transferredBytes)
  const speedBytesPerSecond = byteDelta > 0
    ? byteDelta * 1000 / elapsedMs
    : current.speedBytesPerSecond
  const next = copyTask({
    ...current,
    ...patch,
    status: patch.status === undefined ? current.status : patch.status,
    totalBytes,
    transferredBytes: nextTransferredBytes,
    speedBytesPerSecond,
    id: current.id,
    createdAt: current.createdAt,
    updatedAt: now,
  })
  tasks.set(id, next)
  if (TERMINAL.has(next.status)) controllers.delete(id)
  notify()
  return copyTask(next)
}

export function clearCompleted(allTerminal = false): void {
  for (const [id, task] of tasks) {
    if (task.status === 'completed' || task.status === 'skipped' || (allTerminal && TERMINAL.has(task.status))) {
      tasks.delete(id)
      controllers.delete(id)
    }
  }
  notify()
}

function nextOperationToken(id: string): number {
  const token = (operationTokens.get(id) ?? 0) + 1
  operationTokens.set(id, token)
  return token
}

function failOperation(id: string, token: number, error: unknown): void {
  if (operationTokens.get(id) !== token) return
  const current = tasks.get(id)
  if (current === undefined) return
  if (TERMINAL.has(current.status)) return
  updateTask(id, { status: 'failed', error: errorMessage(error) })
}

async function performOperation(
  id: string,
  target: 'running' | 'paused' | 'cancelled',
  callback: keyof TransferController,
): Promise<void> {
  const current = tasks.get(id)
  if (current === undefined || TERMINAL.has(current.status) || !TRANSITIONS[current.status].has(target)) return
  const token = nextOperationToken(id)
  const controller = controllers.get(id)
  const isCancel = target === 'cancelled'
  const next = isCancel ? current : setStatus(id, target)
  if (next === undefined || (!isCancel && next.status !== target)) return
  try {
    const handler = controller?.[callback]
    if (handler !== undefined) await handler(next)
    if (isCancel) setStatus(id, 'cancelled')
  } catch (error) {
    // Cancellation is committed only after its abort/cleanup hook succeeds;
    // a host 409 therefore leaves the transfer running or marks it failed.
    failOperation(id, token, error)
    throw error
  } finally {
    const final = tasks.get(id)
    if (final !== undefined && TERMINAL.has(final.status)) controllers.delete(id)
  }
}

export function bindController(id: string, controller: TransferController): boolean {
  if (!tasks.has(id) || TERMINAL.has(tasks.get(id)!.status)) return false
  controllers.set(id, controller)
  return true
}

export const updateController = bindController

export function startTask(id: string): Promise<void> {
  return performOperation(id, 'running', 'start')
}

export function pauseTask(id: string): Promise<void> {
  return performOperation(id, 'paused', 'pause')
}

export function resumeTask(id: string): Promise<void> {
  return performOperation(id, 'running', 'resume')
}

export function cancelTask(id: string): Promise<void> {
  return performOperation(id, 'cancelled', 'cancel')
}
