import type { IncomingMessage, ServerResponse } from 'node:http';
export declare const name = "dock-files";
/**
 * Services required before mounting.
 *
 * `webRuntime` used to be listed here and supplied `trustedHosts`; DSH 0.2
 * replaced that service with the `connection` service, which is read lazily
 * through {@link declaredTrustedHosts} so a host without it still mounts
 * (loopback-only fence, the pre-0.2 behaviour).
 */
export declare const inject: string[];
/** Machine-readable error codes of the /wb-files API. */
type WbErrorCode = 'bad-request' | 'forbidden' | 'fs-error' | 'not-found' | 'internal';
/** One API failure with its wire code and HTTP status. */
export declare class WbError extends Error {
    readonly code: WbErrorCode;
    readonly status: number;
    constructor(code: WbErrorCode, message: string, status?: number);
}
/** One explorer row. */
export interface WbFsEntry {
    name: string;
    path: string;
    isDir: boolean;
    hidden: boolean;
}
/** One listed level. */
export interface WbFsListing {
    path: string;
    entries: WbFsEntry[];
    truncated: boolean;
}
/** Parent of a path, or undefined at the filesystem root. */
declare function parentOf(path: string): string | undefined;
/** Root row label of a listing. */
declare function rootLabel(path: string): string;
interface WbContext {
    webServer: {
        register(options: {
            kind: 'prefix';
            path: string;
            handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
        }): () => void;
    };
    sessions: {
        get(sessionId: string): {
            header: {
                cwd?: string;
            };
        } | undefined;
    };
    /**
     * Read a service without declaring a hard dependency on it.
     *
     * Used for the optional `connection` service: a host that does not provide
     * it keeps the loopback-only fence instead of failing to mount.
     */
    get?(name: string): unknown;
    effect(fn: () => void | (() => void), label?: string): void;
}
export declare function apply(ctx: WbContext): void;
export { rootLabel, parentOf };
