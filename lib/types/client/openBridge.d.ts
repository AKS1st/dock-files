import type { FilesService } from './index.ts';
import type { WorkbenchService } from './contract.ts';
export interface OpenResourceOptions {
    [key: string]: unknown;
}
export interface SidebarRightFace {
    openResource(address: string, options?: OpenResourceOptions): void;
}
export interface SessionsFace {
    list: {
        getSnapshot(): {
            current?: string;
            byId: Record<string, {
                cwd?: string;
            }>;
        };
    };
}
export type OpenSourceMode = 'dock' | 'harness';
export interface OpenPathBridgeController {
    mount(sidebarRight: SidebarRightFace): void;
    sync(): void;
    dispose(): void;
}
/** Keep the optional sidebarRight service and bridge lifecycle in one place. */
export declare function createOpenPathBridgeController(getMode: () => OpenSourceMode, install: (sidebarRight: SidebarRightFace, mode: OpenSourceMode) => () => void): OpenPathBridgeController;
/** Build a Harness file resource address using b67's per-segment encoding. */
export declare function sessionResourceAddress(sessionId: string, cwd: string | undefined, path: string): string;
/**
 * Dock mode wraps sidebarRight.openResource. Harness mode deliberately leaves
 * the canonical Harness carrier untouched and installs no wrapper.
 */
export declare function bridgeChatOpens(sidebarRight: SidebarRightFace, workbench: WorkbenchService, files: FilesService, mode?: OpenSourceMode, sessions?: SessionsFace): () => void;
