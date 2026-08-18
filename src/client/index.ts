/**
 * Client half of desk-files: mounts the file-explorer panel into the
 * workbench base. Type-only import of the contract pulls in the
 * `Context.workbench` augmentation; all runtime interaction goes through
 * ctx.workbench method calls (no value-import of the base bundle).
 */
import type {} from 'desk/client/contract'
import type { IconSpec, WorkbenchContext, WorkbenchService } from 'desk/client/contract'
import { ExplorerView } from './ExplorerView'

/** Requires the workbench base to be mounted. */
export const inject = ['workbench']

/** Folder icon (fill style, currentColor), rendered by the desk shell. */
const FOLDER_ICON: IconSpec = {
  path: 'M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z',
}

/** Client plugin body. */
export function apply(ctx: WorkbenchContext): void {
  const service = ctx.get<WorkbenchService>('workbench')
  // Optional-peer guard: skip silently when the base is absent.
  if (service === undefined) return

  // Activity item: the left strip entry that reveals the files pane.
  ctx.effect(() => service.registerActivityBarItem({
    id: 'files',
    title: 'Files',
    icon: FOLDER_ICON,
    order: 10,
    paneId: 'files',
  }), 'desk-files: activity item')

  // The side-bar pane itself.
  ctx.effect(() => service.registerPanel({
    id: 'files',
    region: 'sideBar',
    title: 'Files',
    icon: FOLDER_ICON,
    order: 10,
    component: ExplorerView,
  }), 'desk-files: files panel')
}
