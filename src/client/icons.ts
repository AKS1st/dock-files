/**
 * Icon glyphs for the dock-files explorer.
 *
 * The chrome glyphs (tree arrow, tree corner, folder open/close, refresh,
 * copy, loading, warning, chevron) are vendored verbatim from the DSH
 * harness icon set `@deepseek-ai/dsh-client-ui-primitives` (ic_ds_* family,
 * same Figma source as the deepsuite icon library) — rendered with the same
 * `fill="currentColor"` convention so they follow the active theme exactly
 * like the harness shell's own icons. They are copied here (rather than
 * imported) so this plugin repo keeps building standalone, mirroring the
 * vendored `contract.ts` convention. Keep the path data in sync with
 * `packages/client/ui-primitives/src/icons/index.tsx` when it changes.
 *
 * The one glyph that is NOT in the harness set is the generic document
 * silhouette (drawn in the same ic_ds_ silhouette style); it is tinted per
 * file type (Seti-like muted palette) to give the VSCode-style type colour
 * coding requested for the tree, while the chrome stays theme-following.
 */
import { createElement } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { FileTypeIcon } from './index'

/** One `<path>` layer of a glyph (attributes passthrough for the ic_ds shapes). */
interface PathLayer {
  d: string
  fillRule?: 'evenodd' | 'nonzero'
  clipRule?: string
  opacity?: number
  transform?: string
}

/** A vendored SVG glyph: paths + viewBox + default render size. */
interface Glyph {
  viewBox: string
  layers: PathLayer[]
  /** Default render size in px (square edge). */
  size: number
  /** width/height ratio for non-square glyphs (e.g. the 8×10 tree corner). */
  ratio?: number
}

function svgIcon(
  glyph: Glyph,
  options?: { size?: number; className?: string; style?: CSSProperties; color?: string },
): ReactNode {
  const size = options?.size ?? glyph.size
  const width = glyph.ratio !== undefined ? Math.round(size * glyph.ratio) : size
  const attrs: Record<string, unknown> = {
    width,
    height: size,
    viewBox: glyph.viewBox,
    fill: 'none',
    'aria-hidden': true,
  }
  if (options?.className !== undefined) attrs.className = options.className
  if (options?.style !== undefined) attrs.style = options.style
  const fill = options?.color ?? 'currentColor'
  const children = glyph.layers.map((layer, index) =>
    createElement('path', {
      key: index,
      d: layer.d,
      ...(layer.fillRule !== undefined ? { fillRule: layer.fillRule, clipRule: layer.clipRule ?? 'evenodd' } : {}),
      ...(layer.opacity !== undefined ? { opacity: layer.opacity } : {}),
      ...(layer.transform !== undefined ? { transform: layer.transform } : {}),
      fill,
    }),
  )
  return createElement('svg', attrs, ...children)
}

// ── Vendored ic_ds_* glyphs (source: @deepseek-ai/dsh-client-ui-primitives) ─

/** ic_ds_triangle_right_fill_14 — tree expand arrow; consumers rotate it 90° for the open state. */
const TRIANGLE_RIGHT: Glyph = {
  viewBox: '0 0 14 14',
  size: 14,
  layers: [{
    d: 'M4.25 2.82782L4.25 11.1722C4.25 11.6622 4.84243 11.9076 5.18891 11.5611L9.36109 7.38891C9.57588 7.17412 9.57588 6.82588 9.36109 6.61109L5.18891 2.43891C4.84243 2.09243 4.25 2.33782 4.25 2.82782Z',
  }],
}

/** tree_corner_8x10 — session-tree "L" connector (stroke geometry pre-expanded). */
const TREE_CORNER: Glyph = {
  viewBox: '-0.5 0 8.5 10.5',
  size: 10,
  ratio: 0.8,
  layers: [{
    d: 'M0 0L-0.5 0L-0.5 7L0 7L0.5 7L0.5 0L0 0ZM3 10L3 10.5L8 10.5L8 10L8 9.5L3 9.5L3 10ZM0 7L-0.5 7C-0.5 8.933 1.067 10.5 3 10.5L3 10L3 9.5C1.61929 9.5 0.5 8.38071 0.5 7L0 7Z',
  }],
}

/** ic_ds_folder_close_16. */
const FOLDER_CLOSE: Glyph = {
  viewBox: '0 0 16 16',
  size: 16,
  layers: [{
    transform: 'translate(1.5 2.429)',
    d: 'M5.05582 0.518756L4.50669 0.86654L5.05582 0.518756ZM13 9.4837L13.65 9.4837L13.65 3.53962L13 3.53962L12.35 3.53962L12.35 9.4837L13 9.4837ZM11.3264 1.86603L11.3264 1.21603L6.52313 1.21603L6.52313 1.86603L6.52313 2.51603L11.3264 2.51603L11.3264 1.86603ZM5.58054 1.34727L6.12968 0.999489L5.60495 0.170972L5.05582 0.518756L4.50669 0.86654L5.03141 1.69506L5.58054 1.34727ZM4.11323 1.23058e-13L4.11323 -0.65L1.67359 -0.65L1.67359 5.00699e-14L1.67359 0.65L4.11323 0.65L4.11323 1.23058e-13ZM0 1.67359L-0.65 1.67359L-0.65 9.4837L0 9.4837L0.65 9.4837L0.65 1.67359L0 1.67359ZM11.3264 11.1573L11.3264 10.5073L1.67359 10.5073L1.67359 11.1573L1.67359 11.8073L11.3264 11.8073L11.3264 11.1573ZM0 9.4837L-0.65 9.4837C-0.65 10.767 0.390308 11.8073 1.67359 11.8073L1.67359 11.1573L1.67359 10.5073C1.10828 10.5073 0.65 10.049 0.65 9.4837L0 9.4837ZM1.67359 5.00699e-14L1.67359 -0.65C0.390307 -0.65 -0.65 0.390309 -0.65 1.67359L0 1.67359L0.65 1.67359C0.65 1.10828 1.10828 0.65 1.67359 0.65L1.67359 5.00699e-14ZM5.05582 0.518756L5.60495 0.170972C5.28121 -0.340193 4.71829 -0.65 4.11323 -0.65L4.11323 1.23058e-13L4.11323 0.65C4.27282 0.65 4.4213 0.731715 4.50669 0.86654L5.05582 0.518756ZM6.52313 1.86603L6.52313 1.21603C6.36354 1.21603 6.21507 1.13431 6.12968 0.999489L5.58054 1.34727L5.03141 1.69506C5.35515 2.20622 5.91808 2.51603 6.52313 2.51603L6.52313 1.86603ZM13 3.53962L13.65 3.53962C13.65 2.25634 12.6097 1.21603 11.3264 1.21603L11.3264 1.86603L11.3264 2.51603C11.8917 2.51603 12.35 2.97431 12.35 3.53962L13 3.53962ZM13 9.4837L12.35 9.4837C12.35 10.049 11.8917 10.5073 11.3264 10.5073L11.3264 11.1573L11.3264 11.8073C12.6097 11.8073 13.65 10.767 13.65 9.4837L13 9.4837Z',
  }],
}

/** ic_ds_folder_open_16 (outline + 20%-opacity inner fill, both currentColor). */
const FOLDER_OPEN: Glyph = {
  viewBox: '0 0 16 16',
  size: 16,
  layers: [
    {
      d: 'M5.19629 1.57104C5.81144 1.5711 6.38623 1.8786 6.72754 2.39038L7.19922 3.09839C7.28454 3.22635 7.42824 3.30344 7.58203 3.30347H12.1699C13.5039 3.30348 14.5859 4.38548 14.5859 5.71948V6.62671C15.2694 7.02689 15.6605 7.85012 15.4385 8.68726L14.3848 12.658C14.1037 13.7164 13.1449 14.4527 12.0498 14.4529H2.91699C1.51651 14.4529 0.451662 13.2814 0.501954 11.9519V3.98706C0.501954 2.65305 1.58396 1.57104 2.91797 1.57104H5.19629ZM3.7793 7.75562C3.30994 7.75562 2.89883 8.07153 2.77832 8.52515L1.91602 11.7722C1.74167 12.4291 2.23734 13.073 2.91699 13.073H12.0498C12.5191 13.0728 12.9304 12.757 13.0508 12.3035L14.1045 8.33374C14.1819 8.04202 13.9619 7.756 13.6602 7.75562H3.7793ZM2.91797 2.9519C2.34625 2.9519 1.88281 3.41534 1.88281 3.98706V7.2937C2.33068 6.7269 3.02249 6.37476 3.7793 6.37476H13.2051V5.71948C13.2051 5.14777 12.7416 4.68434 12.1699 4.68433H7.58203C6.96675 4.6843 6.39209 4.37595 6.05078 3.86401L5.5791 3.15601C5.49379 3.02821 5.34995 2.95196 5.19629 2.9519H2.91797Z',
    },
    {
      opacity: 0.2,
      d: 'M13.6602 7.75525C13.9618 7.7556 14.1815 8.04179 14.1045 8.33337L13.0508 12.3031C12.9304 12.7567 12.5191 13.0725 12.0498 13.0726H2.91701C2.23744 13.0725 1.7417 12.4287 1.91603 11.7719L2.77834 8.52478C2.89898 8.07146 3.31018 7.75532 3.77931 7.75525H13.6602ZM5.1963 2.95154C5.34985 2.95159 5.49377 3.02803 5.57912 3.15564L6.0508 3.86365C6.39205 4.37553 6.96685 4.68385 7.58205 4.68396H12.1699C12.7416 4.68396 13.2049 5.14754 13.2051 5.71912V6.37439H3.77931C3.02267 6.37444 2.33067 6.72671 1.88283 7.29333V3.98669C1.88299 3.4152 2.34649 2.95168 2.91798 2.95154H5.1963Z',
    },
  ],
}

/** ic_ds_refresh_outline_16. */
const REFRESH: Glyph = {
  viewBox: '0 0 16 16',
  size: 16,
  layers: [{
    d: 'M7.92136 0.349152C10.3744 0.349234 12.5564 1.5052 13.9557 3.29894L15.1281 2.12759C15.3303 1.92546 15.6767 2.06943 15.6767 2.35538V5.53923C15.6766 5.71626 15.5329 5.85976 15.3559 5.86002H12.171C11.8854 5.8597 11.7426 5.51465 11.9443 5.31249L12.9641 4.29056C11.8237 2.74305 9.98908 1.74106 7.92136 1.74097C4.46436 1.74097 1.66233 4.543 1.66233 8C1.66233 11.457 4.46436 14.259 7.92136 14.259C11.3782 14.2589 14.1804 11.4569 14.1804 8H15.5722C15.5722 12.2251 12.1465 15.6507 7.92136 15.6508C3.69614 15.6508 0.270508 12.2252 0.270508 8C0.270508 3.77478 3.69614 0.349152 7.92136 0.349152Z',
  }],
}

/** ic_ds_copy_outline_16. */
const COPY: Glyph = {
  viewBox: '0 0 16 16',
  size: 16,
  layers: [{
    d: 'M6.14929 4.02032C7.11197 4.02032 7.87983 4.02016 8.49597 4.07598C9.12128 4.13269 9.65792 4.25188 10.1415 4.53106C10.7202 4.8653 11.2008 5.3459 11.535 5.92462C11.8142 6.40818 11.9334 6.94481 11.9901 7.57012C12.0459 8.18625 12.0458 8.95419 12.0458 9.9168C12.0458 10.8795 12.0459 11.6473 11.9901 12.2635C11.9334 12.8888 11.8142 13.4254 11.535 13.909C11.2008 14.4877 10.7202 14.9683 10.1415 15.3025C9.65792 15.5817 9.12128 15.7009 8.49597 15.7576C7.87984 15.8134 7.11196 15.8133 6.14929 15.8133C5.18667 15.8133 4.41874 15.8134 3.80261 15.7576C3.1773 15.7009 2.64067 15.5817 2.1571 15.3025C1.5784 14.9683 1.09778 14.4877 0.76355 13.909C0.484366 13.4254 0.365184 12.8888 0.308472 12.2635C0.252649 11.6473 0.252808 10.8795 0.252808 9.9168C0.252808 8.95418 0.252664 8.18625 0.308472 7.57012C0.365184 6.94481 0.484366 6.40818 0.76355 5.92462C1.09777 5.34589 1.57839 4.86529 2.1571 4.53106C2.64067 4.25188 3.1773 4.13269 3.80261 4.07598C4.41874 4.02017 5.18666 4.02032 6.14929 4.02032ZM6.14929 5.37774C5.16181 5.37774 4.46634 5.37761 3.92566 5.42657C3.39434 5.47472 3.07859 5.56574 2.83582 5.70587C2.4632 5.92106 2.15354 6.2307 1.93835 6.60333C1.79823 6.8461 1.70721 7.16185 1.65906 7.69317C1.6101 8.23385 1.61023 8.92933 1.61023 9.9168C1.61023 10.9043 1.61009 11.5998 1.65906 12.1404C1.70721 12.6717 1.79823 12.9875 1.93835 13.2303C2.15356 13.6029 2.46321 13.9126 2.83582 14.1277C3.07859 14.2679 3.39434 14.3589 3.92566 14.407C4.46634 14.456 5.16182 14.4559 6.14929 14.4559C7.13682 14.4559 7.83224 14.456 8.37292 14.407C8.90425 14.3589 9.21999 14.2679 9.46277 14.1277C9.83535 13.9126 10.145 13.6029 10.3602 13.2303C10.5004 12.9875 10.5914 12.6717 10.6395 12.1404C10.6885 11.5998 10.6884 10.9043 10.6884 9.9168C10.6884 8.92934 10.6885 8.23384 10.6395 7.69317C10.5914 7.16185 10.5004 6.8461 10.3602 6.60333C10.1451 6.23071 9.83536 5.92107 9.46277 5.70587C9.21999 5.56574 8.90424 5.47472 8.37292 5.42657C7.83224 5.3776 7.13682 5.37774 6.14929 5.37774ZM9.80164 0.367975C10.7638 0.367975 11.5314 0.36788 12.1473 0.423639C12.7726 0.480307 13.3093 0.598759 13.7928 0.877741C14.3717 1.21192 14.8521 1.69355 15.1864 2.27227C15.4655 2.75574 15.5857 3.29164 15.6425 3.9168C15.6983 4.53301 15.6971 5.3016 15.6971 6.26446V7.82989C15.6971 8.29264 15.6989 8.58993 15.6649 8.84844C15.4668 10.3525 14.401 11.5738 12.9833 11.9988V10.5467C13.6973 10.1903 14.2105 9.49662 14.3192 8.67169C14.3387 8.52347 14.3407 8.3358 14.3407 7.82989V6.26446C14.3407 5.27706 14.3398 4.58149 14.2909 4.04083C14.2428 3.50968 14.1526 3.19372 14.0126 2.95098C13.7974 2.57849 13.4876 2.26869 13.1151 2.05352C12.8724 1.91347 12.5564 1.82237 12.0253 1.77423C11.4847 1.72528 10.7888 1.7254 9.80164 1.7254H7.71472C6.7562 1.72558 5.92665 2.27697 5.52332 3.07891H4.07019C4.54221 1.51132 5.9932 0.368186 7.71472 0.367975H9.80164Z',
  }],
}

/** ic_ds_loading_outline_16 — an open ring; consumers spin it with CSS. */
const LOADING: Glyph = {
  viewBox: '0 0 16 16',
  size: 16,
  layers: [{
    d: 'M2.871 13.1286C0.0387669 10.2962 0.0387669 5.70383 2.871 2.87141C5.70341 0.0390029 10.2957 0.0391154 13.1282 2.87141L12.1387 3.86094C9.85292 1.57538 6.1469 1.57596 3.86123 3.86163C1.57573 6.14732 1.57573 9.85269 3.86123 12.1384C6.1469 14.424 9.85292 14.4246 12.1387 12.1391L13.1282 13.1286C10.2957 15.9609 5.70341 15.961 2.871 13.1286Z',
  }],
}

/** ic_ds_warning_outline_16. */
const WARNING: Glyph = {
  viewBox: '0 0 14 14',
  size: 14,
  layers: [
    { d: 'M6.3002 3.32843L7.69986 3.32843L7.69986 7.79657H6.3002L6.3002 3.32843Z' },
    { d: 'M6.3002 9.01935H7.69986V10.6711H6.3002V9.01935Z' },
    { d: 'M12.6328 6.99976C12.6328 3.88874 10.111 1.36694 7 1.36694C3.88899 1.36695 1.3672 3.88875 1.36719 6.99976C1.36719 10.1108 3.88899 12.6326 7 12.6326C10.111 12.6326 12.6328 10.1108 12.6328 6.99976ZM13.8582 6.99976C13.8582 10.7873 10.7876 13.8579 7 13.8579C3.21244 13.8579 0.141846 10.7873 0.141846 6.99976C0.141857 3.2122 3.21245 0.141612 7 0.141602C10.7876 0.141602 13.8581 3.21219 13.8582 6.99976Z' },
  ],
}

/** ic_ds_chevron_up_outline_14 — stacked twice for the "collapse all" glyph. */
const CHEVRON_UP: Glyph = {
  viewBox: '0 0 14 14',
  size: 14,
  layers: [{
    d: 'M2.15137 8.5L2.57617 8.07617L5.30273 5.34863C5.55843 5.09294 5.78438 4.86618 5.98828 4.70215C6.20088 4.53117 6.44405 4.38244 6.75 4.33398C6.91565 4.30778 7.08435 4.30778 7.25 4.33398C7.55595 4.38244 7.79912 4.53117 8.01172 4.70215C8.21561 4.86618 8.44157 5.09294 8.69727 5.34863L11.4238 8.07617L11.8486 8.5L11 9.34863L10.5762 8.92383L7.84863 6.19727C7.57405 5.92269 7.40124 5.75152 7.25977 5.6377C7.12709 5.53096 7.07728 5.52187 7.0625 5.51953C7.02105 5.51297 6.97895 5.51297 6.9375 5.51953C6.92272 5.52187 6.87291 5.53096 6.74023 5.6377C6.59876 5.75152 6.42595 5.92268 6.15137 6.19727L3.42383 8.92383L3 9.34863L2.15137 8.5Z',
  }],
}

// ── File-type glyph (harness silhouette style) ─────────────────────────────

/**
 * Generic document silhouette drawn in the ic_ds_ style: the fold corner is
 * a hole (fillRule evenodd) so the glyph reads as a page with a folded
 * corner. Tinted per type through the `color` option.
 */
const FILE_GLYPH: Glyph = {
  viewBox: '0 0 16 16',
  size: 14,
  layers: [{
    fillRule: 'evenodd',
    d: 'M9.25 0.75H4.5A1.75 1.75 0 0 0 2.75 2.5v11a1.75 1.75 0 0 0 1.75 1.75h7a1.75 1.75 0 0 0 1.75-1.75V5.5L9.25 0.75ZM9.25 1.9L12.6 5.5H9.25V1.9Z',
  }],
}

/** Seti-like muted per-type palette (readable on both light and dark themes). */
const FILE_TYPE_COLORS: Record<string, string> = {
  // TypeScript family
  ts: '#519aba', tsx: '#519aba', mts: '#519aba', cts: '#519aba',
  // JavaScript family
  js: '#d9a741', jsx: '#d9a741', mjs: '#d9a741', cjs: '#d9a741',
  json: '#c9c64d',
  md: '#4aa3df', markdown: '#4aa3df', mdx: '#4aa3df',
  yml: '#d4633a', yaml: '#d4633a', toml: '#d4633a', ini: '#d4633a',
  css: '#42a5f5', scss: '#42a5f5', sass: '#42a5f5', less: '#42a5f5',
  html: '#e44d26', htm: '#e44d26',
  png: '#a074c4', jpg: '#a074c4', jpeg: '#a074c4', gif: '#a074c4',
  webp: '#a074c4', svg: '#a074c4', ico: '#a074c4', bmp: '#a074c4', avif: '#a074c4',
  pdf: '#e05151',
  py: '#3572a5', pyc: '#3572a5',
  sh: '#6ab04c', bash: '#6ab04c', zsh: '#6ab04c',
}

/** Fallback tint for unclassified files / dotfiles. */
const GENERIC_FILE_COLOR = '#8b949e'

function extOf(name: string): string {
  const at = name.lastIndexOf('.')
  return at === -1 ? '' : name.slice(at + 1).toLowerCase()
}

/** Per-type tint for a file name (dotfiles and unknown types fall back to gray). */
export function fileColor(name: string): string {
  return FILE_TYPE_COLORS[extOf(name)] ?? GENERIC_FILE_COLOR
}

// ── Public factories used by the explorer view ─────────────────────────────

/** Folder glyph: closed (theme tint) or open. */
export function folderIcon(open: boolean, size = 14): ReactNode {
  return svgIcon(open ? FOLDER_OPEN : FOLDER_CLOSE, { size })
}

/**
 * Per-type file glyph with the full precedence: a registered extension-matched
 * `extIcon` wins outright; otherwise the built-in per-type palette; otherwise
 * the default viewer's `fallbackIcon`; otherwise the generic gray. A custom
 * `path` (ext icon first, then the default icon for palette-unknown types)
 * replaces the generic document silhouette.
 */
export function fileIcon(
  name: string,
  extIcon?: FileTypeIcon,
  fallbackIcon?: FileTypeIcon,
  size = 14,
): ReactNode {
  const paletteColor = FILE_TYPE_COLORS[extOf(name)]
  const color = extIcon?.color ?? paletteColor ?? fallbackIcon?.color ?? GENERIC_FILE_COLOR
  const custom = extIcon?.path !== undefined
    ? extIcon
    : paletteColor === undefined && fallbackIcon?.path !== undefined
      ? fallbackIcon
      : undefined
  if (custom !== undefined) {
    const glyph: Glyph = {
      viewBox: custom.viewBox ?? '0 0 16 16',
      size,
      layers: [{ d: custom.path!, fillRule: 'evenodd' }],
    }
    return svgIcon(glyph, { size, color })
  }
  return svgIcon(FILE_GLYPH, { size, color })
}

/** Tree expand arrow (rotate 90° via CSS for the open state). */
export function treeArrow(size = 10): ReactNode {
  return svgIcon(TRIANGLE_RIGHT, { size })
}

/** Tree guide "L" connector (8×10, tinted by the row's CSS color). */
export function treeCorner(size = 10): ReactNode {
  return svgIcon(TREE_CORNER, { size })
}

export function refreshIcon(size = 14, className?: string): ReactNode {
  return svgIcon(REFRESH, { size, className })
}

export function copyIcon(size = 14): ReactNode {
  return svgIcon(COPY, { size })
}

/** Open loading ring; consumers spin it with the .df-spin class. */
export function loadingIcon(size = 14, className?: string): ReactNode {
  return svgIcon(LOADING, { size, className })
}

export function warningIcon(size = 14): ReactNode {
  return svgIcon(WARNING, { size })
}

export function chevronUpIcon(size = 10): ReactNode {
  return svgIcon(CHEVRON_UP, { size })
}
