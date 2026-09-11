import { createElement, type ReactNode } from 'react'
import type { SettingDefinition } from './contract.ts'
import { detectLocale, translate, type LocaleId } from './i18n.ts'

export type OpenSourceMode = 'dock' | 'harness'

const MODES = ['dock', 'harness'] as const

function modeLabel(mode: OpenSourceMode, locale: LocaleId): string {
  return translate(locale, mode === 'dock' ? 'openSourceDock' : 'openSourceHarness')
}

/**
 * Segmented control shared with dock-base's setting styles; the active dock
 * locale arrives as a prop so this editor needs no workbench service access.
 */
function OpenSourceSetting({ value, onChange, locale: active }: {
  value: OpenSourceMode
  onChange(value: OpenSourceMode): void
  locale?: LocaleId
}): ReactNode {
  const locale = active ?? detectLocale(undefined)
  return createElement('div', {
    className: 'dsh-wb-setting-choices',
    role: 'radiogroup',
    'aria-label': translate(locale, 'openSourceTitle'),
  },
  ...MODES.map((mode) => createElement('button', {
    key: mode,
    type: 'button',
    role: 'radio',
    'aria-checked': value === mode,
    className: `dsh-wb-setting-choice${value === mode ? ' active' : ''}`,
    onClick: () => onChange(mode),
  }, modeLabel(mode, locale))),
  )
}

export const OPEN_SOURCE_SETTING: SettingDefinition<OpenSourceMode> = {
  id: 'dock-files.open-source',
  pluginId: 'dock-files',
  title: (locale) => translate(locale, 'openSourceTitle'),
  description: (locale) => translate(locale, 'openSourceDescription'),
  order: 100,
  defaultValue: 'dock',
  component: OpenSourceSetting,
  validate: (value: unknown): value is OpenSourceMode => value === 'dock' || value === 'harness',
}
