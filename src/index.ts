/**
 * Host half of dock-files: the /wb-files JSON API — single-level directory
 * listing, a stat probe (existence + directory flag, used by the client's
 * chat open-path bridge), plus the file-manager mutations (new file/folder,
 * rename, copy, move, delete), browser-trust fenced like the /api gateway.
 * Stripped and simplified from dsh-better-sidebar (MIT): fs-tree / wire /
 * trust-fence helpers are copied here because the plugin must not depend on
 * another plugin's internals.
 *
 * All operations are conversation-scoped: requests carry a sessionId and
 * the session's authoritative cwd comes from the session store (falling
 * back to the process cwd while a session is hydrating). Every target path
 * is canonicalized with realpath and must stay inside the session
 * workspace; writes never overwrite — colliding names get a numeric suffix.
 */
import { cp, mkdir, opendir, realpath, rename as fsRename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
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

/**
 * Request body cap: large enough for base64-encoded clipboard images
 * (decoded limit is MAX_IMAGE_BYTES; base64 inflates by ~4/3).
 */
const MAX_BODY_BYTES = 1 << 26

/** Decoded size cap for a pasted clipboard image. */
const MAX_IMAGE_BYTES = 32 * 1024 * 1024

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

/** Required string field. */
function stringOf(payload: unknown, key: string): string {
  const value = stringOrUndefined(payload, key)
  if (value === undefined) throw new WbError('bad-request', `missing "${key}"`, 400)
  return value
}

/** Required non-empty array of non-empty strings. */
function stringArrayOf(payload: unknown, key: string): string[] {
  const value = (payload as Record<string, unknown> | null)?.[key]
  if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === 'string' && item !== '')) {
    throw new WbError('bad-request', `"${key}" must be a non-empty array of paths`, 400)
  }
  return value as string[]
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

/**
 * Confine a caller-supplied absolute path to the session workspace: the
 * canonical (symlink-resolved) path must equal the canonical session cwd or
 * live under it (separator boundary). Any escape — `..`, a symlink pointing
 * out of the workspace, or an unrelated absolute path — is rejected 403.
 * Returns the canonical target path, so callers operate on the real path.
 */
async function resolveWorkspacePath(cwd: string, raw: string): Promise<string> {
  const root = await realpath(cwd).catch(() => resolve(cwd))
  requireAbsolute(raw)
  let target: string
  try {
    target = await realpath(raw)
  } catch {
    // A not-yet-existing target (e.g. a future write): canonicalize the
    // parent directory and re-append the basename, then check containment.
    const parent = await realpath(dirname(raw)).catch(() => dirname(raw))
    target = join(parent, basename(raw))
  }
  const rel = relative(root, target)
  if (rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) {
    return target
  }
  throw new WbError('forbidden', `path is outside the session workspace: "${raw}"`, 403)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// ── fs-mutation helpers (new / rename / copy / move / remove) ─────────────

/** A new basename must be a plain name: no separators, no dot paths. */
function validateBasename(name: string): void {
  if (name === '' || name === '.' || name === '..') {
    throw new WbError('bad-request', 'name must be a valid file name', 400)
  }
  if (name.includes('/') || name.includes('\\') || name.includes('\0')) {
    throw new WbError('bad-request', 'name must not contain path separators', 400)
  }
}

/** Split "新建文件.txt" into ["新建文件", ".txt"]; dotfiles keep the whole name. */
function splitExt(name: string): [string, string] {
  const at = name.lastIndexOf('.')
  if (at <= 0) return [name, '']
  return [name.slice(0, at), name.slice(at)]
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** First free name "base", "base 2", "base 3" … under `dir` (ext preserved). */
async function uniqueName(dir: string, base: string): Promise<string> {
  const [stem, ext] = splitExt(base)
  for (let counter = 1; ; counter += 1) {
    const candidate = counter === 1 ? base : `${stem} ${counter}${ext}`
    if (!(await pathExists(join(dir, candidate)))) return candidate
  }
}

/** Create a new file or directory with a unique default name (never overwrites). */
async function createEntry(
  cwd: string,
  parent: string,
  kind: 'file' | 'dir',
  locale?: string,
): Promise<{ path: string; name: string }> {
  const dir = await resolveWorkspacePath(cwd, parent)
  const zh = locale !== 'en'
  if (kind === 'file') {
    const name = await uniqueName(dir, zh ? '新建文件.txt' : 'New File.txt')
    await writeFile(join(dir, name), '', { flag: 'wx' })
    return { path: join(dir, name), name }
  }
  const name = await uniqueName(dir, zh ? '新建文件夹' : 'New Folder')
  await mkdir(join(dir, name))
  return { path: join(dir, name), name }
}

/** Rename the basename of a path in place (same directory). */
async function renameEntry(cwd: string, source: string, name: string): Promise<{ path: string }> {
  validateBasename(name)
  const from = await resolveWorkspacePath(cwd, source)
  const target = await resolveWorkspacePath(cwd, join(dirname(from), name))
  if (target === from) return { path: from } // same name: no-op
  if (await pathExists(target)) {
    throw new WbError('fs-error', `"${name}" already exists`, 409)
  }
  await fsRename(from, target)
  return { path: target }
}

/** Reject copying/moving a directory into itself or a descendant. */
function assertNotSelfNested(from: string, destDir: string, isDir: boolean, verb: 'copy' | 'move'): void {
  if (!isDir) return
  const rel = relative(from, destDir)
  if (rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))) {
    throw new WbError('bad-request', `cannot ${verb} a directory into itself`, 400)
  }
}

/** Copy sources into `dest` with unique names (never overwrites). */
async function copyEntries(cwd: string, sources: string[], dest: string): Promise<{ created: string[] }> {
  const destDir = await resolveWorkspacePath(cwd, dest)
  const created: string[] = []
  for (const raw of sources) {
    const from = await resolveWorkspacePath(cwd, raw)
    const info = await stat(from).catch(() => {
      throw new WbError('fs-error', `"${raw}" does not exist`, 404)
    })
    assertNotSelfNested(from, destDir, info.isDirectory(), 'copy')
    const name = await uniqueName(destDir, basename(from))
    const to = join(destDir, name)
    await cp(from, to, { recursive: true, errorOnExist: true })
    created.push(to)
  }
  return { created }
}

/** Move sources into `dest` with unique names (never overwrites). */
async function moveEntries(cwd: string, sources: string[], dest: string): Promise<{ moved: string[] }> {
  const destDir = await resolveWorkspacePath(cwd, dest)
  const moved: string[] = []
  for (const raw of sources) {
    const from = await resolveWorkspacePath(cwd, raw)
    const info = await stat(from).catch(() => {
      throw new WbError('fs-error', `"${raw}" does not exist`, 404)
    })
    assertNotSelfNested(from, destDir, info.isDirectory(), 'move')
    if (dirname(from) === destDir) {
      moved.push(from) // already here: no-op
      continue
    }
    const name = await uniqueName(destDir, basename(from))
    const to = join(destDir, name)
    await fsRename(from, to)
    moved.push(to)
  }
  return { moved }
}

/** Recursively remove entries (no trash bin — client confirms first). */
async function removeEntries(cwd: string, paths: string[]): Promise<{ removed: string[] }> {
  const removed: string[] = []
  for (const raw of paths) {
    const target = await resolveWorkspacePath(cwd, raw)
    await rm(target, { recursive: true, force: false }).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new WbError('fs-error', `"${raw}" does not exist`, 404)
      }
      throw error
    })
    removed.push(target)
  }
  return { removed }
}

// ── Clipboard image paste ──────────────────────────────────────────────────

/** Accepted image mime → default file extension for pasted clipboard images. */
const IMAGE_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
  'image/x-icon': '.ico',
}

/** Magic-byte check so a fake mime can't smuggle arbitrary bytes as an image
 *  (svg is XML and skips the check; unknown image/* mimes are trusted). */
function imageMagicOk(mime: string, bytes: Buffer): boolean {
  if (mime === 'image/svg+xml') return bytes.length > 0
  if (mime === 'image/png') {
    return bytes.length >= 8
      && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (mime === 'image/gif') {
    const head = bytes.subarray(0, 6).toString('latin1')
    return head === 'GIF87a' || head === 'GIF89a'
  }
  if (mime === 'image/webp') {
    return bytes.length >= 12
      && bytes.subarray(0, 4).toString('latin1') === 'RIFF'
      && bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  }
  if (mime === 'image/bmp') {
    return bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d
  }
  return true
}

/** Save a clipboard image (base64) under `parent` with a unique name. */
async function saveImageEntry(
  cwd: string,
  parent: string,
  mime: string,
  data: string,
  suggested?: string,
): Promise<{ path: string; name: string }> {
  if (!mime.startsWith('image/')) {
    throw new WbError('bad-request', 'not an image mime type', 400)
  }
  const dir = await resolveWorkspacePath(cwd, parent)
  const bytes = Buffer.from(data, 'base64')
  if (bytes.length === 0) throw new WbError('bad-request', 'image data is empty', 400)
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new WbError('bad-request', 'image is too large', 400)
  }
  if (!imageMagicOk(mime, bytes)) {
    throw new WbError('bad-request', 'image data does not match its mime type', 400)
  }
  const ext = IMAGE_EXT[mime] ?? '.png'
  const stem = suggested !== undefined && suggested.trim() !== '' ? suggested.trim() : 'image'
  const base = stem.endsWith(ext) ? stem : `${stem}${ext}`
  const name = await uniqueName(dir, base)
  await writeFile(join(dir, name), bytes, { flag: 'wx' })
  return { path: join(dir, name), name }
}

/** Decoded size cap for a file dragged into the explorer from the OS. */
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024

/** Save a dragged-in file (base64) under `parent` with a unique name. */
async function uploadEntry(
  cwd: string,
  parent: string,
  name: string,
  data: string,
): Promise<{ path: string; name: string }> {
  validateBasename(name)
  const dir = await resolveWorkspacePath(cwd, parent)
  const bytes = Buffer.from(data, 'base64')
  if (bytes.length === 0) throw new WbError('bad-request', 'file is empty', 400)
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new WbError('bad-request', 'file is too large', 400)
  }
  const fileName = await uniqueName(dir, name)
  await writeFile(join(dir, fileName), bytes, { flag: 'wx' })
  return { path: join(dir, fileName), name: fileName }
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
        const sessionId = stringOrUndefined(payload, 'sessionId')
        const cwd = sessionCwdOf(ctx, sessionId)
        if (method === 'list') {
          const raw = stringOrUndefined(payload, 'path')
          const target = raw === undefined ? cwd : await resolveWorkspacePath(cwd, raw)
          const listing = await listDirectory(target)
          writeOk(res, { listing, cwd })
          return
        }
        if (method === 'probe') {
          // Routing probe for the client chat open-path bridge: stat an
          // absolute path and report existence + directory flag without
          // listing anything. No workspace confinement — the decision is a
          // routing heuristic (workbench viewer vs native opener), and the
          // existence of a path the page already displays is not sensitive.
          const raw = stringOf(payload, 'path')
          requireAbsolute(raw)
          const info = await stat(raw).catch(() => undefined)
          writeOk(res, info === undefined
            ? { exists: false, isDir: false }
            : { exists: true, isDir: info.isDirectory() })
          return
        }
        if (method === 'create') {
          const parent = stringOf(payload, 'parent')
          const kind = stringOf(payload, 'kind')
          if (kind !== 'file' && kind !== 'dir') {
            throw new WbError('bad-request', 'kind must be "file" or "dir"', 400)
          }
          writeOk(res, await createEntry(cwd, parent, kind, stringOrUndefined(payload, 'locale')))
          return
        }
        if (method === 'rename') {
          const path = stringOf(payload, 'path')
          const name = stringOf(payload, 'name')
          writeOk(res, await renameEntry(cwd, path, name))
          return
        }
        if (method === 'copy' || method === 'move') {
          const sources = stringArrayOf(payload, 'sources')
          const dest = stringOf(payload, 'dest')
          const value = method === 'copy'
            ? await copyEntries(cwd, sources, dest)
            : await moveEntries(cwd, sources, dest)
          writeOk(res, value)
          return
        }
        if (method === 'remove') {
          const paths = stringArrayOf(payload, 'paths')
          writeOk(res, await removeEntries(cwd, paths))
          return
        }
        if (method === 'saveImage') {
          const parent = stringOf(payload, 'parent')
          const mime = stringOf(payload, 'mime')
          const data = stringOf(payload, 'data')
          writeOk(res, await saveImageEntry(cwd, parent, mime, data, stringOrUndefined(payload, 'name')))
          return
        }
        if (method === 'upload') {
          const parent = stringOf(payload, 'parent')
          const name = stringOf(payload, 'name')
          const data = stringOf(payload, 'data')
          writeOk(res, await uploadEntry(cwd, parent, name, data))
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
