import { type ReactNode } from 'react';
import type { ViewProps, WorkbenchContext, WorkbenchService } from './contract.ts';
export declare function transferIcon(size?: number): ReactNode;
export declare function TransferView({ ctx }: ViewProps): ReactNode;
export declare function TransferStatusBar({ ctx }: {
    ctx: WorkbenchContext;
}): ReactNode;
export declare function openTransferView(workbench: WorkbenchService | undefined): void;
