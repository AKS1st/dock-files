import { opendir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
//#region src/index.ts
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
const MAX_BODY_BYTES = 1 << 20;
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
				if (method === "list") {
					const sessionId = stringOrUndefined(payload, "sessionId");
					const raw = stringOrUndefined(payload, "path");
					const cwd = sessionCwdOf(ctx, sessionId);
					writeOk(res, {
						listing: await listDirectory(raw === void 0 ? cwd : await resolveWorkspacePath(cwd, raw)),
						cwd
					});
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
