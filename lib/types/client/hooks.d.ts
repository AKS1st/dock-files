import type { WorkbenchContext } from './contract.ts';
import { type LocaleId } from './i18n';
/** Translate bound to one locale: (key, params?) → string. */
export type T = (key: string, params?: Record<string, string | number>) => string;
/**
 * The active DSH locale, re-resolved on every 'locale/change' event (the
 * locale service publishes the snapshot the same way getSnapshot does).
 */
export declare function useLocale(ctx: WorkbenchContext): LocaleId;
