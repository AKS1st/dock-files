/**
 * Shared client hooks for dock-files: the locale subscription hook and the
 * translate-bound function type. i18n.ts stays pure (no React import); the
 * React glue lives here (same pattern as dock-git).
 */
import { useEffect, useState } from 'react'
import type { WorkbenchContext } from './contract.ts'
import { detectLocale, type LocaleId } from './i18n'

/** Translate bound to one locale: (key, params?) → string. */
export type T = (key: string, params?: Record<string, string | number>) => string

/**
 * The active DSH locale, re-resolved on every 'locale/change' event (the
 * locale service publishes the snapshot the same way getSnapshot does).
 */
export function useLocale(ctx: WorkbenchContext): LocaleId {
  const [locale, setLocale] = useState<LocaleId>(() => detectLocale(ctx))
  useEffect(() => ctx.on('locale/change', () => setLocale(detectLocale(ctx))), [ctx])
  return locale
}
