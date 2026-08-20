/**
 * dock-files client i18n: a tiny, dependency-free dictionary module (zh / en)
 * plus a `detectLocale` helper that reads the DSH locale service
 * (`ctx.get('locale').getSnapshot().active`, backed by settings.yaml
 * locale.preference with the browser language as fallback).
 *
 * The module is deliberately pure — no runtime imports, no DOM, no React —
 * mirroring dock-git's i18n.ts. The view layer combines it with the DSH
 * `locale/change` event (ctx.on) to re-render on a locale switch.
 *
 * Lookup order per key: DICTS[locale][key] → DICTS.zh[key] → the key itself
 * (missing text stays visible rather than blank).
 */
export type LocaleId = 'zh' | 'en';
export interface Dict {
    [key: string]: string;
}
/** Complete dictionaries — every key below exists in BOTH locales. */
export declare const DICTS: Record<LocaleId, Dict>;
/** Resolve the active DSH locale from the locale service, then the browser. */
export declare function detectLocale(ctx: unknown): LocaleId;
/** Translate one key for a locale, substituting {name} params. */
export declare function translate(locale: LocaleId, key: string, params?: Record<string, string | number>): string;
