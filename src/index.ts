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
import { createReadStream } from 'node:fs'
import { cp, link, lstat, mkdir, opendir, open, realpath, rename as fsRename, rm, stat, truncate, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
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

/** Single-request uploads share the streaming upload size ceiling. */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024

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

/** Maximum bytes accepted by one streaming upload chunk. */
const MAX_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024
/** Maximum size of a streaming upload session (4 GiB). */
const MAX_STREAM_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024
const UPLOAD_SESSION_TTL_MS = 30 * 60 * 1000
const MAX_ACTIVE_UPLOAD_SESSIONS = 8
const UPLOAD_CLEANUP_INTERVAL_MS = 60 * 1000

interface UploadSession {
  uploadId: string
  sessionId: string
  parent: string
  name: string
  size: number
  received: number
  tempPath: string
  chunkQueue: Promise<void>
  activeChunk: number
  finalizing: boolean
  lastActivity: number
}

function safeIntegerOf(payload: unknown, key: string): number {
  const value = (payload as Record<string, unknown> | null)?.[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new WbError('bad-request', `"${key}" must be a non-negative safe integer`, 400)
  }
  return value
}

function queryStringOf(url: URL, key: string): string {
  const value = url.searchParams.get(key)
  if (value === null || value === '') throw new WbError('bad-request', `missing "${key}"`, 400)
  return value
}

function querySafeIntegerOf(url: URL, key: string): number {
  const raw = queryStringOf(url, key)
  if (!/^\d+$/.test(raw)) throw new WbError('bad-request', `"${key}" must be a non-negative safe integer`, 400)
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) throw new WbError('bad-request', `"${key}" must be a non-negative safe integer`, 400)
  return value
}

async function removeUpload(upload: UploadSession): Promise<void> {
  await rm(upload.tempPath, { force: true }).catch(() => undefined)
}

function removeStaleUploads(uploads: Map<string, UploadSession>, now = Date.now()): void {
  for (const [uploadId, upload] of uploads) {
    if (now - upload.lastActivity > UPLOAD_SESSION_TTL_MS && upload.activeChunk === 0 && !upload.finalizing) {
      uploads.delete(uploadId)
      void removeUpload(upload)
    }
  }
}

/** Stream one confined regular file, or return a structured skip for symlinks. */
async function streamDownload(
  cwd: string,
  rawPath: string,
  res: ServerResponse,
): Promise<void> {
  // resolveWorkspacePath follows links for containment validation, while lstat
  // on the caller path preserves the link identity for the skip decision.
  const resolved = await resolveWorkspacePath(cwd, rawPath)
  const info = await lstat(rawPath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new WbError('not-found', `file does not exist: "${rawPath}"`, 404)
    }
    throw error
  })
  if (info.isSymbolicLink()) {
    writeOk(res, { status: 'skipped', reason: 'symbolic-link', path: rawPath })
    return
  }
  if (!info.isFile()) throw new WbError('bad-request', 'download target is not a regular file', 400)
  const name = basename(rawPath)
  res.writeHead(200, {
    'content-type': 'application/octet-stream',
    'content-length': String(info.size),
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
  })
  await new Promise<void>((resolveStream, reject) => {
    const stream = createReadStream(resolved)
    stream.once('error', reject)
    res.once('close', () => {
      if (!res.writableEnded) stream.destroy()
    })
    stream.once('end', resolveStream)
    stream.pipe(res)
  })
}

async function startUpload(
  cwd: string,
  sessionId: string,
  parent: string,
  name: string,
  size: number,
): Promise<UploadSession> {
  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_STREAM_UPLOAD_BYTES) {
    throw new WbError('bad-request', 'upload size exceeds the maximum', 400)
  }
  validateBasename(name)
  const dir = await resolveWorkspacePath(cwd, parent)
  const info = await stat(dir).catch(() => undefined)
  if (info === undefined || !info.isDirectory()) throw new WbError('fs-error', `"${parent}" is not a directory`, 400)
  const uploadId = randomUUID()
  const tempPath = join(dir, `.dsh-upload-${uploadId}-${randomUUID()}.tmp`)
  await writeFile(tempPath, '', { flag: 'wx' })
  return {
    uploadId,
    sessionId,
    parent: dir,
    size,
    received: 0,
    name,
    tempPath,
    chunkQueue: Promise.resolve(),
    activeChunk: 0,
    finalizing: false,
    lastActivity: Date.now(),
  }
}

async function receiveQueuedUploadChunk(req: IncomingMessage, upload: UploadSession, offset: number): Promise<number> {
  if (upload.finalizing) throw new WbError('bad-request', 'upload session is completing', 409)
  upload.lastActivity = Date.now()
  const previous = upload.chunkQueue
  const current = previous.then(() => receiveUploadChunk(req, upload, offset))
  // Always release the queue, including when this request fails. The route
  // removes the failed session/temp file, while already queued requests still
  // observe the resulting strict offset/file errors.
  upload.chunkQueue = current.then(() => undefined, () => undefined)
  return current
}

async function receiveUploadChunk(req: IncomingMessage, upload: UploadSession, offset: number): Promise<number> {
  if (offset !== upload.received) throw new WbError('bad-request', 'chunk offset does not match received bytes', 409)
  if (offset > upload.size) throw new WbError('bad-request', 'chunk offset exceeds upload size', 400)
  const file = await open(upload.tempPath, 'r+')
  let received = 0
  upload.activeChunk += 1
  try {
    for await (const chunk of req) {
      upload.lastActivity = Date.now()
      const buffer = Buffer.from(chunk)
      received += buffer.length
      if (received > MAX_UPLOAD_CHUNK_BYTES || offset + received > upload.size) {
        throw new WbError('bad-request', 'upload chunk is too large', 400)
      }
      if (buffer.length > 0) await file.write(buffer, 0, buffer.length, offset + received - buffer.length)
    }
    await file.sync()
    upload.received += received
    upload.lastActivity = Date.now()
    return upload.received
  } catch (error) {
    await truncate(upload.tempPath, upload.received).catch(() => undefined)
    throw error
  } finally {
    upload.activeChunk -= 1
    await file.close().catch(() => undefined)
  }
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

/** Require a live session with an authoritative, non-empty workspace. */
function requireSessionCwd(ctx: WbContext, sessionId: string | undefined): string {
  if (sessionId === undefined) throw new WbError('bad-request', 'missing "sessionId"', 400)
  const session = ctx.sessions.get(sessionId)
  if (session === undefined) throw new WbError('not-found', 'session not found', 404)
  if (typeof session.header.cwd !== 'string' || session.header.cwd === '') {
    throw new WbError('bad-request', 'session cwd is empty', 400)
  }
  return session.header.cwd
}

export function apply(ctx: WbContext): void {
  const uploads = new Map<string, UploadSession>()
  let startingUploads = 0
  ctx.effect(() => {
    const cleanupTimer = setInterval(() => removeStaleUploads(uploads), UPLOAD_CLEANUP_INTERVAL_MS)
    const unregister = ctx.webServer.register({
    kind: 'prefix',
    path: '/wb-files',
    handler: async (req, res) => {
      if (!isTrustedRequest(req, ctx.webRuntime.trustedHosts)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
        return
      }
      const requestUrl = new URL(req.url ?? '/', 'http://dsh.internal')
      const requestPathname = requestUrl.pathname
      const method = requestPathname.startsWith('/wb-files/') ? requestPathname.slice('/wb-files/'.length) : undefined
      const isDownload = req.method === 'GET' && method === 'download'
      if (req.method !== 'POST' && !isDownload) {
        writeJson(res, 405, { ok: false, error: { code: 'bad-request', message: 'method not allowed' } })
        return
      }
      if (method === undefined || method.includes('/')) {
        writeError(res, new WbError('not-found', `unknown /wb-files method "${method}"`, 404))
        return
      }
      try {
        if (method === 'download') {
          const sessionId = queryStringOf(requestUrl, 'sessionId')
          const cwd = requireSessionCwd(ctx, sessionId)
          const path = queryStringOf(requestUrl, 'path')
          await streamDownload(cwd, path, res)
          return
        }
        if (method === 'uploadChunk') {
         const sessionId = queryStringOf(requestUrl, 'sessionId')
         requireSessionCwd(ctx, sessionId)
         const uploadId = queryStringOf(requestUrl, 'uploadId')
         const offset = querySafeIntegerOf(requestUrl, 'offset')
         const upload = uploads.get(uploadId)
         if (upload === undefined || upload.sessionId !== sessionId) throw new WbError('not-found', 'upload session not found', 404)
         try {
           const received = await receiveQueuedUploadChunk(req, upload, offset)
           writeOk(res, { uploadId, size: upload.size, received })
         } catch (error) {
           if (!upload.finalizing && uploads.get(uploadId) === upload) {
             uploads.delete(uploadId)
             await removeUpload(upload)
           }
           throw error
         }
         return
       }
       const payload = await readJsonBody(req)
        const sessionId = stringOrUndefined(payload, 'sessionId')
        let cwd = ''
         if (method === 'uploadStart') {
            removeStaleUploads(uploads)
             if (uploads.size + startingUploads >= MAX_ACTIVE_UPLOAD_SESSIONS) {
               throw new WbError('bad-request', 'too many active upload sessions', 429)
             }
             startingUploads += 1
            if (true) {
              if (true) {
              }
            }
            const startCwd = requireSessionCwd(ctx, sessionId)
            const parent = stringOf(payload, 'parent')
            const name = stringOf(payload, 'name')
            const size = safeIntegerOf(payload, 'size')
            let upload: UploadSession
             try {
               upload = await startUpload(startCwd, sessionId as string, parent, name, size)
             } catch (error) {
               startingUploads -= 1
               throw error
             }
             startingUploads -= 1
            uploads.set(upload.uploadId, upload)
            writeOk(res, { uploadId: upload.uploadId, size: upload.size, received: upload.received, name: upload.name })
            return
          }
          cwd = sessionCwdOf(ctx, sessionId)
          if (method === 'uploadComplete') {
            const completeSessionCwd = requireSessionCwd(ctx, sessionId)
            const uploadId = stringOf(payload, 'uploadId')
            const upload = uploads.get(uploadId)
            if (upload === undefined || upload.sessionId !== sessionId) throw new WbError('not-found', 'upload session not found', 404)
            if (upload.finalizing) throw new WbError('bad-request', 'upload session is completing', 409)
             upload.finalizing = true
            try {
              await upload.chunkQueue
              const size = safeIntegerOf(payload, 'size')
              if (size !== upload.size || upload.received !== upload.size) throw new WbError('bad-request', 'upload size does not match received bytes', 400)
              const parent = await resolveWorkspacePath(completeSessionCwd, upload.parent)
              const info = await stat(parent).catch(() => undefined)
              if (info === undefined || !info.isDirectory()) throw new WbError('fs-error', 'upload destination is no longer a directory', 400)
              let name: string
              let path: string
              for (;;) {
                name = await uniqueName(parent, upload.name)
                path = join(parent, name)
                try {
                  await link(upload.tempPath, path)
                  await unlink(upload.tempPath)
                  break
                } catch (error) {
                  if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
                  throw error
                }
              }
              writeOk(res, { path, name })
            } finally {
              if (uploads.get(uploadId) === upload) uploads.delete(uploadId)
              await removeUpload(upload)
            }
            return
          }
          if (method === 'uploadCancel') {
            const cancelSessionId = stringOf(payload, 'sessionId')
            requireSessionCwd(ctx, cancelSessionId)
            const uploadId = stringOf(payload, 'uploadId')
            const upload = uploads.get(uploadId)
            if (upload !== undefined) {
              if (upload.sessionId !== cancelSessionId) throw new WbError('not-found', 'upload session not found', 404)
              if (upload.finalizing) throw new WbError('bad-request', 'upload session is completing', 409)
              if (uploads.get(uploadId) === upload) uploads.delete(uploadId)
              await removeUpload(upload)
            }
            writeOk(res, { uploadId, cancelled: upload !== undefined })
            return
          }
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
    })
    return () => {
      clearInterval(cleanupTimer)
      unregister()
      for (const upload of uploads.values()) void removeUpload(upload)
      uploads.clear()
    }
  }, 'dock-files: /wb-files routes')
}

// Kept referenced so rootLabel/parentOf survive tree-shaking for the
// explorer's "up" navigation (Phase 1 lists the root only).
export { rootLabel, parentOf }
