/**
 * Module-level, in-memory transfer task store shared by all Explorer views.
 * Tasks contain only serializable transfer state; payloads and host objects stay
 * with the caller and are accessed through the optional controller callbacks.
 */
export type TransferKind = 'upload' | 'download';
export type TransferStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'skipped';
export interface TransferTask {
    id: string;
    kind: TransferKind;
    name: string;
    sourcePath: string;
    targetPath?: string;
    sessionId?: string;
    totalBytes: number;
    transferredBytes: number;
    speedBytesPerSecond: number;
    dedupeKey?: string;
    status: TransferStatus;
    error?: string;
    createdAt: number;
    updatedAt: number;
}
export interface TransferController {
    start?: (task: TransferTask) => void | Promise<void>;
    pause?: (task: TransferTask) => void | Promise<void>;
    resume?: (task: TransferTask) => void | Promise<void>;
    cancel?: (task: TransferTask) => void | Promise<void>;
}
export interface CreateTransferTaskInput {
    kind: TransferKind;
    name: string;
    sourcePath: string;
    targetPath?: string;
    sessionId?: string;
    totalBytes: number;
    transferredBytes?: number;
    dedupeKey?: string;
    controller?: TransferController;
}
type MutableTaskFields = Pick<TransferTask, 'name' | 'sourcePath' | 'targetPath' | 'sessionId' | 'totalBytes' | 'transferredBytes' | 'status' | 'error'>;
export type TransferTaskPatch = Partial<MutableTaskFields>;
export interface TransferSnapshot {
    tasks: readonly TransferTask[];
    totalTransferred: number;
    totalBytes: number;
    activeCount: number;
}
export type TransferListener = () => void;
export declare function subscribe(listener: TransferListener): () => void;
export declare function getSnapshot(): TransferSnapshot;
export declare function getTotalProgress(): {
    totalTransferred: number;
    totalBytes: number;
};
export declare function createTask(input: CreateTransferTaskInput): TransferTask;
/** Alias emphasizing that this task is intended for a transfer pipeline. */
export declare const createTransferTask: typeof createTask;
/** Return whether an equivalent upload was created within the debounce window. */
export declare function hasRecentUpload(dedupeKey: string, now?: number): boolean;
export declare function updateTask(id: string, patch: TransferTaskPatch): TransferTask | undefined;
export declare function clearCompleted(allTerminal?: boolean): void;
export declare function bindController(id: string, controller: TransferController): boolean;
export declare const updateController: typeof bindController;
export declare function startTask(id: string): Promise<void>;
export declare function pauseTask(id: string): Promise<void>;
export declare function resumeTask(id: string): Promise<void>;
export declare function cancelTask(id: string): Promise<void>;
export {};
