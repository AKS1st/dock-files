import { createElement, useSyncExternalStore, type ReactNode } from 'react'
import type { ViewProps, WorkbenchContext, WorkbenchService } from './contract.ts'
import {
  cancelTask,
  clearCompleted,
  getSnapshot,
  pauseTask,
  resumeTask,
  subscribe,
  type TransferStatus,
  type TransferTask,
} from './transferStore'
import { translate } from './i18n'
import { useLocale } from './hooks'

const TERMINAL: ReadonlySet<TransferStatus> = new Set(['completed', 'skipped', 'failed', 'cancelled'])

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = -1
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}

function statusLabel(status: TransferStatus, t: (key: string) => string): string {
  return t(`transferStatus.${status}`)
}

function taskProgress(task: TransferTask): number {
  if (task.totalBytes <= 0) return task.status === 'completed' ? 100 : 0
  return Math.min(100, Math.round((task.transferredBytes / task.totalBytes) * 100))
}

export function transferIcon(size = 16): ReactNode {
  return createElement('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  },
  createElement('path', { d: 'M12 3v12' }),
  createElement('path', { d: 'm7 10 5 5 5-5' }),
  createElement('path', { d: 'M5 21h14' }))
}

function actionButton(label: string, onClick: () => void): ReactNode {
  return createElement('button', {
    type: 'button',
    className: 'df-transfer-action',
    onClick,
    'aria-label': label,
  }, label)
}

export function TransferView({ ctx }: ViewProps): ReactNode {
  const locale = useLocale(ctx)
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const t = (key: string, params?: Record<string, string | number>): string => translate(locale, key, params)
  const activeTasks = snapshot.tasks.filter((task) => !TERMINAL.has(task.status))
  const totalProgress = snapshot.totalBytes > 0
    ? Math.min(100, Math.round((snapshot.totalTransferred / snapshot.totalBytes) * 100))
    : 0

  return createElement('section', { className: 'df-transfer-view' },
    createElement('header', { className: 'df-transfer-header' },
      createElement('div', { className: 'df-transfer-title' }, transferIcon(), createElement('span', null, t('transferCenter'))),
      createElement('div', { className: 'df-transfer-summary' },
        t('transferSummary', { active: activeTasks.length, progress: totalProgress })),
      createElement('button', {
        type: 'button',
        className: 'df-transfer-clear',
        onClick: () => clearCompleted(false),
      }, t('clearCompleted')),
    ),
    createElement('div', { className: 'df-transfer-list' },
      snapshot.tasks.length === 0
        ? createElement('div', { className: 'df-transfer-empty' }, t('noTransfers'))
        : snapshot.tasks.map((task) => {
          const progress = taskProgress(task)
          const canPause = task.status === 'running' || task.status === 'queued'
          const canResume = task.status === 'paused'
          return createElement('article', { className: 'df-transfer-row', key: task.id },
            createElement('div', { className: 'df-transfer-main' },
              createElement('div', { className: 'df-transfer-name', title: task.name }, task.name),
              createElement('div', { className: 'df-transfer-kind' }, `${t(task.kind === 'upload' ? 'upload' : 'download')} · ${statusLabel(task.status, t)}`),
            ),
            createElement('div', { className: 'df-transfer-paths' },
              createElement('span', { title: task.sourcePath }, task.sourcePath),
              createElement('span', { className: 'df-transfer-path-arrow', 'aria-hidden': true }, '→'),
              createElement('span', { title: task.targetPath ?? '' }, task.targetPath ?? '—'),
            ),
            createElement('div', { className: 'df-transfer-progress' },
              createElement('div', { className: 'df-transfer-progress-track' },
                createElement('div', { className: 'df-transfer-progress-fill', style: { width: `${progress}%` } })),
              createElement('span', null, `${progress}% · ${formatBytes(task.transferredBytes)} / ${formatBytes(task.totalBytes)}`),
            ),
            createElement('div', { className: 'df-transfer-actions' },
              canPause ? actionButton(t('pause'), () => { void pauseTask(task.id) }) : null,
              canResume ? actionButton(t('resume'), () => { void resumeTask(task.id) }) : null,
              !TERMINAL.has(task.status) ? actionButton(t('cancel'), () => { void cancelTask(task.id) }) : null,
            ),
            task.error !== undefined ? createElement('div', { className: 'df-transfer-error' }, task.error) : null,
          )
        }),
    ),
  )
}

export function TransferStatusBar({ ctx }: { ctx: WorkbenchContext }): ReactNode {
  const locale = useLocale(ctx)
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const progress = snapshot.totalBytes > 0 ? Math.min(100, Math.round(snapshot.totalTransferred / snapshot.totalBytes * 100)) : 0
  return createElement('button', {
    type: 'button',
    className: 'df-transfer-status',
    onClick: () => openTransferView(ctx.get<WorkbenchService>('workbench')),
    title: translate(locale, 'openTransferCenter'),
  }, transferIcon(14), createElement('span', null, `${snapshot.activeCount} · ${progress}%`))
}

export function openTransferView(workbench: WorkbenchService | undefined): void {
  workbench?.openView('transfers', undefined, { floating: true })
}
