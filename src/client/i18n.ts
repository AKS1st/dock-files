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

export type LocaleId = 'zh' | 'en'

export interface Dict {
  [key: string]: string
}

/** Complete dictionaries — every key below exists in BOTH locales. */
export const DICTS: Record<LocaleId, Dict> = {
  zh: {
    // ── Toolbar / states ──
    refresh: '刷新',
    collapseAll: '折叠全部',
    emptyDir: '空目录',
    noSession: '无会话',
    loading: '加载中…',
    // ── Context menu ──
    open: '打开',
    newFile: '新建文件',
    newFolder: '新建文件夹',
    rename: '重命名',
    copy: '复制',
    cut: '剪切',
    paste: '粘贴',
    pasteWithName: '粘贴 {name}',
    pasteImage: '粘贴图片',
    delete: '删除',
    copyPath: '复制路径',
    // ── Dialog ──
    ok: '确定',
    cancel: '取消',
    confirmDelete: '确定删除 "{name}"？此操作不可恢复。',
    // ── Alerts ──
    clipboardNoImage: '剪贴板中没有图片',
    clipboardUnsupported: '当前浏览器不支持读取剪贴板图片',
    uploadBusy: '请等上一个上传任务完成',
    // ── Default file names (host create / nameless uploads) ──
    newFileBase: '新建文件.txt',
    newFolderBase: '新建文件夹',
    fileFallbackName: '文件',
  },
  en: {
    // ── Toolbar / states ──
    refresh: 'Refresh',
    collapseAll: 'Collapse All',
    emptyDir: 'Empty directory',
    noSession: 'No session',
    loading: 'Loading…',
    // ── Context menu ──
    open: 'Open',
    newFile: 'New File',
    newFolder: 'New Folder',
    rename: 'Rename',
    copy: 'Copy',
    cut: 'Cut',
    paste: 'Paste',
    pasteWithName: 'Paste {name}',
    pasteImage: 'Paste Image',
    delete: 'Delete',
    copyPath: 'Copy Path',
    // ── Dialog ──
    ok: 'OK',
    cancel: 'Cancel',
    confirmDelete: 'Delete "{name}"? This cannot be undone.',
    // ── Alerts ──
    clipboardNoImage: 'No image in the clipboard',
    clipboardUnsupported: 'Your browser cannot read clipboard images',
    uploadBusy: 'Please wait for the previous upload to finish',
    // ── Default file names (host create / nameless uploads) ──
    newFileBase: 'New File.txt',
    newFolderBase: 'New Folder',
    fileFallbackName: 'File',
  },
}

/** Resolve the active DSH locale from the locale service, then the browser. */
export function detectLocale(ctx: unknown): LocaleId {
  const locale = (ctx as { get?: (name: string) => unknown } | null | undefined)?.get?.('locale') as
    | { getSnapshot?: () => { active?: unknown } }
    | undefined
  const active = locale?.getSnapshot?.()?.active
  if (active === 'zh' || active === 'en') return active
  if (typeof navigator !== 'undefined' && typeof navigator.language === 'string' && navigator.language.toLowerCase().startsWith('zh')) {
    return 'zh'
  }
  return 'en'
}

/** Translate one key for a locale, substituting {name} params. */
export function translate(locale: LocaleId, key: string, params?: Record<string, string | number>): string {
  const template = DICTS[locale]?.[key] ?? DICTS.zh[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    (name in params ? String(params[name]) : match))
}
