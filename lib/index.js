import { cp, mkdir, opendir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
//#region src/index.ts
/**
* Host half of dock-files: the /wb-files JSON API — single-level directory
* listing plus the file-manager mutations (new file/folder, rename, copy,
* move, delete), browser-trust fenced like the /api gateway. Stripped and
* simplified from dsh-better-sidebar (MIT): fs-tree / wire / trust-fence
* helpers are copied here because the plugin must not depend on another
* plugin's internals.
*
* All operations are conversation-scoped: requests carry a sessionId and
* the session's authoritative cwd comes from the session store (falling
* back to the process cwd while a session is hydrating). Every target path
* is canonicalized with realpath and must stay inside the session
* workspace; writes never overwrite — colliding names get a numeric suffix.
*/
const name = "dock-files";
/** Services required before mounting. */
const inject = [
	"webServer",
	"sessions",
	"webRuntime"
];
/** One API failure with its wire code and HTTP status. */
var WbError = class extends Error {
	code;
	status;
	constructor(code, message, status = 400) {
		super(message);
		this.code = code;
		this.status = status;
	}
};
/**
* Request body cap: large enough for base64-encoded clipboard images
* (decoded limit is MAX_IMAGE_BYTES; base64 inflates by ~4/3).
*/
const MAX_BODY_BYTES = 1 << 26;
/** Decoded size cap for a pasted clipboard image. */
const MAX_IMAGE_BYTES = 33554432;
async function readJsonBody(req) {
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = Buffer.from(chunk);
		total += buffer.length;
		if (total > MAX_BODY_BYTES) throw new WbError("bad-request", "request body too large");
		chunks.push(buffer);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	if (text.trim() === "") return {};
	try {
		return JSON.parse(text);
	} catch {
		throw new WbError("bad-request", "request body is not valid JSON");
	}
}
function writeJson(res, status, body) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}
function writeOk(res, value) {
	writeJson(res, 200, {
		ok: true,
		value
	});
}
function writeError(res, error) {
	if (error instanceof WbError) {
		writeJson(res, error.status, {
			ok: false,
			error: {
				code: error.code,
				message: error.message
			}
		});
		return;
	}
	writeJson(res, 500, {
		ok: false,
		error: {
			code: "internal",
			message: error instanceof Error ? error.message : String(error)
		}
	});
}
function stringOrUndefined(payload, key) {
	const value = payload?.[key];
	return typeof value === "string" && value !== "" ? value : void 0;
}
/** Required string field. */
function stringOf(payload, key) {
	const value = stringOrUndefined(payload, key);
	if (value === void 0) throw new WbError("bad-request", `missing "${key}"`, 400);
	return value;
}
/** Required non-empty array of non-empty strings. */
function stringArrayOf(payload, key) {
	const value = payload?.[key];
	if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === "string" && item !== "")) throw new WbError("bad-request", `"${key}" must be a non-empty array of paths`, 400);
	return value;
}
/** Directory-first, case-insensitive name ordering (VSCode explorer order). */
function compareEntries(a, b) {
	if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
	return a.name.localeCompare(b.name, void 0, { sensitivity: "base" });
}
/** List one directory level. */
async function listDirectory(path, maxEntries = 1e3) {
	let level;
	try {
		level = await opendir(path);
	} catch (error) {
		throw new WbError("fs-error", `cannot list "${path}": ${messageOf(error)}`, 400);
	}
	const rows = [];
	let overflow = 0;
	try {
		for await (const dirent of level) {
			if (rows.length >= maxEntries) {
				overflow += 1;
				continue;
			}
			rows.push({
				name: dirent.name,
				path: join(path, dirent.name),
				isDir: dirent.isDirectory(),
				hidden: dirent.name.startsWith(".")
			});
		}
	} catch (error) {
		throw new WbError("fs-error", `cannot list "${path}": ${messageOf(error)}`, 400);
	}
	rows.sort(compareEntries);
	return {
		path,
		entries: rows,
		truncated: overflow > 0
	};
}
/** Parent of a path, or undefined at the filesystem root. */
function parentOf(path) {
	const parent = dirname(path);
	return parent === path ? void 0 : parent;
}
/** Root row label of a listing. */
function rootLabel(path) {
	const base = basename(path);
	return base !== "" ? base : path;
}
/** Normalize a caller-supplied path to an absolute, resolved path or throw. */
function requireAbsolute(path) {
	if (!path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path)) throw new WbError("fs-error", `"${path}" is not an absolute path`, 400);
	return resolve(path);
}
/**
* Confine a caller-supplied absolute path to the session workspace: the
* canonical (symlink-resolved) path must equal the canonical session cwd or
* live under it (separator boundary). Any escape — `..`, a symlink pointing
* out of the workspace, or an unrelated absolute path — is rejected 403.
* Returns the canonical target path, so callers operate on the real path.
*/
async function resolveWorkspacePath(cwd, raw) {
	const root = await realpath(cwd).catch(() => resolve(cwd));
	requireAbsolute(raw);
	let target;
	try {
		target = await realpath(raw);
	} catch {
		const parent = await realpath(dirname(raw)).catch(() => dirname(raw));
		target = join(parent, basename(raw));
	}
	const rel = relative(root, target);
	if (rel === "" || rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) return target;
	throw new WbError("forbidden", `path is outside the session workspace: "${raw}"`, 403);
}
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
/** A new basename must be a plain name: no separators, no dot paths. */
function validateBasename(name) {
	if (name === "" || name === "." || name === "..") throw new WbError("bad-request", "name must be a valid file name", 400);
	if (name.includes("/") || name.includes("\\") || name.includes("\0")) throw new WbError("bad-request", "name must not contain path separators", 400);
}
/** Split "新建文件.txt" into ["新建文件", ".txt"]; dotfiles keep the whole name. */
function splitExt(name) {
	const at = name.lastIndexOf(".");
	if (at <= 0) return [name, ""];
	return [name.slice(0, at), name.slice(at)];
}
async function pathExists(path) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}
/** First free name "base", "base 2", "base 3" … under `dir` (ext preserved). */
async function uniqueName(dir, base) {
	const [stem, ext] = splitExt(base);
	for (let counter = 1;; counter += 1) {
		const candidate = counter === 1 ? base : `${stem} ${counter}${ext}`;
		if (!await pathExists(join(dir, candidate))) return candidate;
	}
}
/** Create a new file or directory with a unique default name (never overwrites). */
async function createEntry(cwd, parent, kind) {
	const dir = await resolveWorkspacePath(cwd, parent);
	if (kind === "file") {
		const name = await uniqueName(dir, "新建文件.txt");
		await writeFile(join(dir, name), "", { flag: "wx" });
		return {
			path: join(dir, name),
			name
		};
	}
	const name = await uniqueName(dir, "新建文件夹");
	await mkdir(join(dir, name));
	return {
		path: join(dir, name),
		name
	};
}
/** Rename the basename of a path in place (same directory). */
async function renameEntry(cwd, source, name) {
	validateBasename(name);
	const from = await resolveWorkspacePath(cwd, source);
	const target = await resolveWorkspacePath(cwd, join(dirname(from), name));
	if (target === from) return { path: from };
	if (await pathExists(target)) throw new WbError("fs-error", `"${name}" already exists`, 409);
	await rename(from, target);
	return { path: target };
}
/** Reject copying/moving a directory into itself or a descendant. */
function assertNotSelfNested(from, destDir, isDir, verb) {
	if (!isDir) return;
	const rel = relative(from, destDir);
	if (rel === "" || rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) throw new WbError("bad-request", `cannot ${verb} a directory into itself`, 400);
}
/** Copy sources into `dest` with unique names (never overwrites). */
async function copyEntries(cwd, sources, dest) {
	const destDir = await resolveWorkspacePath(cwd, dest);
	const created = [];
	for (const raw of sources) {
		const from = await resolveWorkspacePath(cwd, raw);
		assertNotSelfNested(from, destDir, (await stat(from).catch(() => {
			throw new WbError("fs-error", `"${raw}" does not exist`, 404);
		})).isDirectory(), "copy");
		const name = await uniqueName(destDir, basename(from));
		const to = join(destDir, name);
		await cp(from, to, {
			recursive: true,
			errorOnExist: true
		});
		created.push(to);
	}
	return { created };
}
/** Move sources into `dest` with unique names (never overwrites). */
async function moveEntries(cwd, sources, dest) {
	const destDir = await resolveWorkspacePath(cwd, dest);
	const moved = [];
	for (const raw of sources) {
		const from = await resolveWorkspacePath(cwd, raw);
		assertNotSelfNested(from, destDir, (await stat(from).catch(() => {
			throw new WbError("fs-error", `"${raw}" does not exist`, 404);
		})).isDirectory(), "move");
		if (dirname(from) === destDir) {
			moved.push(from);
			continue;
		}
		const name = await uniqueName(destDir, basename(from));
		const to = join(destDir, name);
		await rename(from, to);
		moved.push(to);
	}
	return { moved };
}
/** Recursively remove entries (no trash bin — client confirms first). */
async function removeEntries(cwd, paths) {
	const removed = [];
	for (const raw of paths) {
		const target = await resolveWorkspacePath(cwd, raw);
		await rm(target, {
			recursive: true,
			force: false
		}).catch((error) => {
			if (error.code === "ENOENT") throw new WbError("fs-error", `"${raw}" does not exist`, 404);
			throw error;
		});
		removed.push(target);
	}
	return { removed };
}
/** Accepted image mime → default file extension for pasted clipboard images. */
const IMAGE_EXT = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/jpg": ".jpg",
	"image/gif": ".gif",
	"image/webp": ".webp",
	"image/bmp": ".bmp",
	"image/svg+xml": ".svg",
	"image/avif": ".avif",
	"image/x-icon": ".ico"
};
/** Magic-byte check so a fake mime can't smuggle arbitrary bytes as an image
*  (svg is XML and skips the check; unknown image/* mimes are trusted). */
function imageMagicOk(mime, bytes) {
	if (mime === "image/svg+xml") return bytes.length > 0;
	if (mime === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([
		137,
		80,
		78,
		71,
		13,
		10,
		26,
		10
	]));
	if (mime === "image/jpeg" || mime === "image/jpg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
	if (mime === "image/gif") {
		const head = bytes.subarray(0, 6).toString("latin1");
		return head === "GIF87a" || head === "GIF89a";
	}
	if (mime === "image/webp") return bytes.length >= 12 && bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";
	if (mime === "image/bmp") return bytes.length >= 2 && bytes[0] === 66 && bytes[1] === 77;
	return true;
}
/** Save a clipboard image (base64) under `parent` with a unique name. */
async function saveImageEntry(cwd, parent, mime, data, suggested) {
	if (!mime.startsWith("image/")) throw new WbError("bad-request", "not an image mime type", 400);
	const dir = await resolveWorkspacePath(cwd, parent);
	const bytes = Buffer.from(data, "base64");
	if (bytes.length === 0) throw new WbError("bad-request", "image data is empty", 400);
	if (bytes.length > MAX_IMAGE_BYTES) throw new WbError("bad-request", "image is too large", 400);
	if (!imageMagicOk(mime, bytes)) throw new WbError("bad-request", "image data does not match its mime type", 400);
	const ext = IMAGE_EXT[mime] ?? ".png";
	const stem = suggested !== void 0 && suggested.trim() !== "" ? suggested.trim() : "image";
	const name = await uniqueName(dir, stem.endsWith(ext) ? stem : `${stem}${ext}`);
	await writeFile(join(dir, name), bytes, { flag: "wx" });
	return {
		path: join(dir, name),
		name
	};
}
function header(headers, name) {
	const value = headers[name];
	return typeof value === "string" ? value : void 0;
}
function isLoopbackHostname(hostname) {
	if (hostname === "localhost" || hostname === "[::1]") return true;
	const parts = hostname.split(".");
	return parts.length === 4 && parts[0] === "127" && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}
function parseAuthority(authority) {
	try {
		return new URL(`http://${authority}`);
	} catch {
		return;
	}
}
function canonicalAuthority(entry, entryUrl) {
	const port = entryUrl.port !== "" ? entryUrl.port : new URL(`https://${entry}`).port;
	return port === "" ? entryUrl.hostname : `${entryUrl.hostname}:${port}`;
}
function isTrustedAuthority(hostUrl, trustedHosts) {
	return trustedHosts.some((entry) => {
		const entryUrl = parseAuthority(entry);
		if (entryUrl === void 0) return false;
		return canonicalAuthority(entry, entryUrl) === entryUrl.hostname ? entryUrl.hostname === hostUrl.hostname : entryUrl.host === hostUrl.host;
	});
}
/** DNS-rebinding / cross-site defense (not authentication). */
function isTrustedRequest(request, trustedHosts) {
	const host = header(request.headers, "host");
	if (host === void 0) return false;
	const hostUrl = parseAuthority(host);
	if (hostUrl === void 0) return false;
	if (!isLoopbackHostname(hostUrl.hostname) && !isTrustedAuthority(hostUrl, trustedHosts)) return false;
	if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
	const origin = header(request.headers, "origin");
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
/** Resolve a session's authoritative working directory. */
function sessionCwdOf(ctx, sessionId) {
	if (sessionId !== void 0) {
		const cwd = ctx.sessions.get(sessionId)?.header.cwd;
		if (cwd !== void 0 && cwd !== "") return cwd;
	}
	return process.cwd();
}
function apply(ctx) {
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/wb-files",
		handler: async (req, res) => {
			if (!isTrustedRequest(req, ctx.webRuntime.trustedHosts)) {
				writeJson(res, 403, {
					ok: false,
					error: {
						code: "forbidden",
						message: "forbidden"
					}
				});
				return;
			}
			if (req.method !== "POST") {
				writeJson(res, 405, {
					ok: false,
					error: {
						code: "bad-request",
						message: "method not allowed"
					}
				});
				return;
			}
			const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
			const method = pathname.startsWith("/wb-files/") ? pathname.slice(10) : void 0;
			if (method === void 0 || method.includes("/")) {
				writeError(res, new WbError("not-found", `unknown /wb-files method "${method}"`, 404));
				return;
			}
			try {
				const payload = await readJsonBody(req);
				const cwd = sessionCwdOf(ctx, stringOrUndefined(payload, "sessionId"));
				if (method === "list") {
					const raw = stringOrUndefined(payload, "path");
					writeOk(res, {
						listing: await listDirectory(raw === void 0 ? cwd : await resolveWorkspacePath(cwd, raw)),
						cwd
					});
					return;
				}
				if (method === "create") {
					const parent = stringOf(payload, "parent");
					const kind = stringOf(payload, "kind");
					if (kind !== "file" && kind !== "dir") throw new WbError("bad-request", "kind must be \"file\" or \"dir\"", 400);
					writeOk(res, await createEntry(cwd, parent, kind));
					return;
				}
				if (method === "rename") {
					writeOk(res, await renameEntry(cwd, stringOf(payload, "path"), stringOf(payload, "name")));
					return;
				}
				if (method === "copy" || method === "move") {
					const sources = stringArrayOf(payload, "sources");
					const dest = stringOf(payload, "dest");
					writeOk(res, method === "copy" ? await copyEntries(cwd, sources, dest) : await moveEntries(cwd, sources, dest));
					return;
				}
				if (method === "remove") {
					writeOk(res, await removeEntries(cwd, stringArrayOf(payload, "paths")));
					return;
				}
				if (method === "saveImage") {
					writeOk(res, await saveImageEntry(cwd, stringOf(payload, "parent"), stringOf(payload, "mime"), stringOf(payload, "data"), stringOrUndefined(payload, "name")));
					return;
				}
				writeError(res, new WbError("not-found", `unknown /wb-files method "${method}"`, 404));
			} catch (error) {
				writeError(res, error);
			}
		}
	}), "dock-files: /wb-files routes");
}
//#endregion
export { WbError, apply, inject, name, parentOf, rootLabel };
