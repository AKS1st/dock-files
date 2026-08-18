/**
 * Host half of dock-files: the /wb-files JSON API (single-level directory
 * listing, browser-trust fenced like the /api gateway). Stripped and
 * simplified from dsh-better-sidebar (MIT): fs-tree / wire / trust-fence
 * helpers are copied here because the plugin must not depend on another
 * plugin's internals.
 *
 * All operations are conversation-scoped: requests carry a sessionId and
 * the session's authoritative cwd comes from the session store (falling
 * back to the process cwd while a session is hydrating).
 */
import { opendir } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'node:http'

export const name = 'dock-files'

/** Services required before mounting. */
export const inject = ['webServer', 'sessions', 'webRuntime']

// ── Wire helpers (stripped from dsh-better-sidebar/src/wire.ts) ──────────

/** Machine-readable error codes of the /wb-files API. */
type WbErrorCode = 'bad-request' | 'forbidden' | 'fs-error' | 'not-found' | 'internal'

/** One API failure with its wire code and HTTP status. */
export class WbError extends Error {
  constructor(
    readonly code: WbErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message)
  }
}

const MAX_BODY_BYTES = 1 << 20

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > MAX_BODY_BYTES) throw new WbError('bad-request', 'request body too large')
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new WbError('bad-request', 'request body is not valid JSON')
  }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function writeOk(res: ServerResponse, value: unknown): void {
  writeJson(res, 200, { ok: true, value })
}

function writeError(res: ServerResponse, error: unknown): void {
  if (error instanceof WbError) {
    writeJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } })
    return
  }
  const message = error instanceof Error ? error.message : String(error)
  writeJson(res, 500, { ok: false, error: { code: 'internal', message } })
}

function stringOrUndefined(payload: unknown, key: string): string | undefined {
  const value = (payload as Record<string, unknown> | null)?.[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

// ── fs-tree helpers (stripped from dsh-better-sidebar/src/fs-tree.ts) ─────

/** One explorer row. */
export interface WbFsEntry {
  name: string
  path: string
  isDir: boolean
  hidden: boolean
}

/** One listed level. */
export interface WbFsListing {
  path: string
  entries: WbFsEntry[]
  truncated: boolean
}

/** Directory-first, case-insensitive name ordering (VSCode explorer order). */
function compareEntries(a: WbFsEntry, b: WbFsEntry): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

/** List one directory level. */
async function listDirectory(path: string, maxEntries = 1000): Promise<WbFsListing> {
  let level
  try {
    level = await opendir(path)
  } catch (error) {
    throw new WbError('fs-error', `cannot list "${path}": ${messageOf(error)}`, 400)
  }
  const rows: WbFsEntry[] = []
  let overflow = 0
  try {
    for await (const dirent of level) {
      if (rows.length >= maxEntries) {
        overflow += 1
        continue
      }
      rows.push({
        name: dirent.name,
        path: join(path, dirent.name),
        isDir: dirent.isDirectory(),
        hidden: dirent.name.startsWith('.'),
      })
    }
  } catch (error) {
    throw new WbError('fs-error', `cannot list "${path}": ${messageOf(error)}`, 400)
  }
  rows.sort(compareEntries)
  return { path, entries: rows, truncated: overflow > 0 }
}

/** Parent of a path, or undefined at the filesystem root. */
function parentOf(path: string): string | undefined {
  const parent = dirname(path)
  return parent === path ? undefined : parent
}

/** Root row label of a listing. */
function rootLabel(path: string): string {
  const base = basename(path)
  return base !== '' ? base : path
}

/** Normalize a caller-supplied path to an absolute, resolved path or throw. */
function requireAbsolute(path: string): string {
  if (!path.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(path)) {
    throw new WbError('fs-error', `"${path}" is not an absolute path`, 400)
  }
  return resolve(path)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// ── Trust fence (stripped from dsh-better-sidebar/src/trust-fence.ts) ─────

function header(headers: IncomingHttpHeaders, name: string): string | undefined {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every(part => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function parseAuthority(authority: string): URL | undefined {
  try {
    return new URL(`http://${authority}`)
  } catch {
    return undefined
  }
}

function canonicalAuthority(entry: string, entryUrl: URL): string {
  const port = entryUrl.port !== '' ? entryUrl.port : new URL(`https://${entry}`).port
  return port === '' ? entryUrl.hostname : `${entryUrl.hostname}:${port}`
}

function isTrustedAuthority(hostUrl: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const entryUrl = parseAuthority(entry)
    if (entryUrl === undefined) return false
    return canonicalAuthority(entry, entryUrl) === entryUrl.hostname
      ? entryUrl.hostname === hostUrl.hostname
      : entryUrl.host === hostUrl.host
  })
}

/** DNS-rebinding / cross-site defense (not authentication). */
function isTrustedRequest(request: IncomingMessage, trustedHosts: readonly string[]): boolean {
  const host = header(request.headers, 'host')
  if (host === undefined) return false
  const hostUrl = parseAuthority(host)
  if (hostUrl === undefined) return false
  if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false
  if (header(request.headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = header(request.headers, 'origin')
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

// ── Plugin body ───────────────────────────────────────────────────────────

interface WbContext {
  webServer: {
    register(options: {
      kind: 'prefix'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
    }): () => void
  }
  sessions: {
    get(sessionId: string): { header: { cwd?: string } } | undefined
  }
  webRuntime: {
    trustedHosts: readonly string[]
  }
  effect(fn: () => void | (() => void), label?: string): void
}

/** Resolve a session's authoritative working directory. */
function sessionCwdOf(ctx: WbContext, sessionId: string | undefined): string {
  if (sessionId !== undefined) {
    const cwd = ctx.sessions.get(sessionId)?.header.cwd
    if (cwd !== undefined && cwd !== '') return cwd
  }
  return process.cwd()
}

export function apply(ctx: WbContext): void {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/wb-files',
    handler: async (req, res) => {
      if (!isTrustedRequest(req, ctx.webRuntime.trustedHosts)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
        return
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'bad-request', message: 'method not allowed' } })
        return
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
      const method = pathname.startsWith('/wb-files/') ? pathname.slice('/wb-files/'.length) : undefined
      if (method === undefined || method.includes('/')) {
        writeError(res, new WbError('not-found', `unknown /wb-files method "${method}"`, 404))
        return
      }
      try {
        const payload = await readJsonBody(req)
        if (method === 'list') {
          const sessionId = stringOrUndefined(payload, 'sessionId')
          const raw = stringOrUndefined(payload, 'path')
          const cwd = sessionCwdOf(ctx, sessionId)
          const target = raw === undefined ? cwd : requireAbsolute(raw)
          const listing = await listDirectory(target)
          writeOk(res, { listing, cwd })
          return
        }
        writeError(res, new WbError('not-found', `unknown /wb-files method "${method}"`, 404))
      } catch (error) {
        writeError(res, error)
      }
    },
  }), 'dock-files: /wb-files routes')
}

// Kept referenced so rootLabel/parentOf survive tree-shaking for the
// explorer's "up" navigation (Phase 1 lists the root only).
export { rootLabel, parentOf }
