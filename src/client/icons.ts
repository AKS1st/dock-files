/**
 * Icon glyphs for the dock-files explorer.
 *
 * The chrome glyphs (tree arrow, tree corner, folder open/close, refresh,
 * copy, loading, warning, chevron, plus, edit, trash, right-up) are vendored
 * verbatim from the DSH harness icon set
 * `@deepseek-ai/dsh-client-ui-primitives` (ic_ds_* family, same Figma source
 * as the deepsuite icon library) — rendered with the same
 * `fill="currentColor"` convention so they follow the active theme exactly
 * like the harness shell's own icons. They are copied here (rather than
 * imported) so this plugin repo keeps building standalone, mirroring the
 * vendored `contract.ts` convention. Keep the path data in sync with
 * `packages/client/ui-primitives/src/icons/index.tsx` when it changes.
 *
 * Glyphs that are NOT in the harness set — the generic document silhouette,
 * the scissors (cut), the clipboard (paste) and the folder-plus (new folder)
 * — are drawn in the same ic_ds_ silhouette style; the document silhouette is
 * tinted per file type (Seti-like muted palette) to give the VSCode-style
 * type colour coding requested for the tree, while the chrome stays
 * theme-following.
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

/** Compact opposing chevrons — a single, balanced "collapse all" glyph. */
const COLLAPSE_ALL: Glyph = {
  viewBox: '0 0 16 14',
  size: 14,
  ratio: 16 / 14,
  layers: [
    { d: 'M1.5 3.5L5.5 7L1.5 10.5L2.45 11.55L7.65 7L2.45 2.45L1.5 3.5Z' },
    { d: 'M14.5 3.5L10.5 7L14.5 10.5L13.55 11.55L8.35 7L13.55 2.45L14.5 3.5Z' },
  ],
}

/** Upload arrow into a tray — imports OS files into the current directory. */
const UPLOAD: Glyph = {
  viewBox: '0 0 16 16',
  size: 16,
  layers: [
    { d: 'M7.35 10.5V3.95L5.1 6.2L4.05 5.15L8 1.2L11.95 5.15L10.9 6.2L8.65 3.95V10.5H7.35Z' },
    { d: 'M2.2 9.5H3.5V13.5H12.5V9.5H13.8V13.5C13.8 14.22 13.22 14.8 12.5 14.8H3.5C2.78 14.8 2.2 14.22 2.2 13.5V9.5Z' },
  ],
}

/** ic_ds_plus_outline_16 — new file. */
const PLUS: Glyph = {
  viewBox: '0 0 16 16',
  size: 16,
  layers: [{
    d: 'M8.64453 1.5V7.34961H14.5V8.65039H8.64453V14.5H7.34473V8.65039H1.5V7.34961H7.34473V1.5H8.64453Z',
  }],
}

/** ic_ds_edit_outline_16 — rename. */
const EDIT: Glyph = {
  viewBox: '0 0 16 16',
  size: 16,
  layers: [{
    d: 'M9.94076 1.34942C10.7047 0.90231 11.6503 0.902415 12.4143 1.34942C12.7061 1.52015 12.9688 1.79118 13.3104 2.13284C13.6521 2.47448 13.9231 2.73721 14.0939 3.02894C14.5408 3.79294 14.5409 4.73856 14.0939 5.50251C13.9231 5.79415 13.652 6.05704 13.3104 6.39861L6.65932 13.0497C6.28068 13.4284 6.00695 13.7108 5.66543 13.9097C5.32391 14.1085 4.94315 14.2074 4.42705 14.3498L3.24394 14.6761C2.77527 14.8054 2.34538 14.9262 2.00131 14.9684C1.65196 15.0112 1.17964 15.0013 0.810764 14.6325C0.441921 14.2637 0.432107 13.7913 0.47486 13.442C0.517035 13.0979 0.6379 12.668 0.767181 12.1993L1.09352 11.0162C1.23588 10.5001 1.33481 10.1193 1.5336 9.77784C1.7325 9.43632 2.0149 9.1626 2.39355 8.78395L9.04466 2.13284C9.38625 1.79126 9.64911 1.52016 9.94076 1.34942ZM15.5427 14.8398H7.55223L8.96707 13.425H15.5427V14.8398ZM3.39382 9.78422C2.965 10.213 2.84244 10.3436 2.75709 10.49C2.67183 10.6366 2.61862 10.8079 2.45733 11.3925L2.13099 12.5756C2.00183 13.0439 1.92194 13.3419 1.88863 13.5536C2.10041 13.5204 2.39872 13.4416 2.86764 13.3123L4.05075 12.9859C4.63544 12.8246 4.80669 12.7715 4.95323 12.6862C5.09968 12.6008 5.23022 12.4783 5.65905 12.0494L10.721 6.98644L8.45577 4.72121L3.39382 9.78422ZM11.7 2.57079C11.3774 2.38198 10.9777 2.38198 10.6551 2.57079C10.5602 2.62647 10.4487 2.72931 10.0449 3.13311L9.45604 3.72094L11.7213 5.98617L12.3102 5.39833C12.7139 4.99457 12.8168 4.88307 12.8725 4.78818C13.0613 4.46561 13.0612 4.06585 12.8725 3.74326C12.8169 3.64827 12.7146 3.53752 12.3102 3.13311C11.9057 2.72863 11.795 2.6264 11.7 2.57079Z',
  }],
}

/** ic_ds_trash_outline_16 — delete. */
const TRASH: Glyph = {
  viewBox: '0 0 16 16',
  size: 16,
  layers: [{
    d: 'M14.4782 4.84067L14.2138 10.1152C14.1102 12.1872 14.067 13.0115 13.3866 13.9607C13.1044 14.3546 12.7498 14.6912 12.3424 14.9535C11.8239 15.2872 11.2415 15.4316 10.5585 15.4998C9.88727 15.5668 9.04946 15.5656 7.99998 15.5656C6.95051 15.5656 6.1127 15.5668 5.44142 15.4998C4.75851 15.4316 4.17602 15.2872 3.65753 14.9535C3.25012 14.6912 2.89559 14.3546 2.61332 13.9607C1.93296 13.0115 1.88979 12.1872 1.78619 10.1152L1.52179 4.84067L2.89006 4.77277L3.15343 10.0463C3.26221 12.2218 3.32452 12.6015 3.72646 13.1624C3.90825 13.4161 4.13686 13.6334 4.39927 13.8023C4.66204 13.9714 5.00263 14.0792 5.57825 14.1367C6.16562 14.1953 6.92298 14.1963 7.99998 14.1963C9.07699 14.1963 9.83434 14.1953 10.4217 14.1367C10.9973 14.0792 11.3379 13.9714 11.6007 13.8023C11.8631 13.6334 12.0917 13.4161 12.2735 13.1624C12.6755 12.6015 12.7378 12.2218 12.8465 10.0463L13.1099 4.77277L14.4782 4.84067ZM5.43011 6.22849H6.7994V11.3909H5.43011V6.22849ZM9.20056 6.22849H10.5699V11.3909H9.20056V6.22849ZM8.53597 0.434431C9.17976 0.434431 9.6522 0.426926 10.0966 0.571258C10.2357 0.616451 10.3717 0.672554 10.502 0.738948C10.9182 0.951107 11.2464 1.29099 11.7015 1.74612L12.4978 2.54136H15.3742V3.91169H0.625732V2.54136H3.50218L4.29845 1.74612C4.75358 1.29099 5.08174 0.951107 5.49801 0.738948C5.62831 0.672554 5.76425 0.616451 5.90334 0.571258C6.34776 0.426926 6.82021 0.434431 7.46399 0.434431H8.53597ZM7.46399 1.80476C6.73208 1.80476 6.51641 1.81187 6.32617 1.87369C6.25545 1.89667 6.18668 1.92533 6.12041 1.95907C5.96398 2.03878 5.82348 2.16253 5.44142 2.54136H10.5585C10.1765 2.16253 10.036 2.03878 9.87955 1.95907C9.81329 1.92533 9.74452 1.89667 9.6738 1.87369C9.48356 1.81187 9.26789 1.80476 8.53597 1.80476H7.46399Z',
  }],
}

/** ic_ds_right_up_outline_16 — open. */
const OPEN: Glyph = {
  viewBox: '0 0 16 16',
  size: 16,
  layers: [{
    d: 'M13.588429 5.147807C13.588429 4.739638 13.587271 4.403003 13.582013 4.118684L1.703098 15.99968L0.85155 15.148178L0 14.294485L11.878915 2.413442C11.594721 2.408199 11.257569 2.409154 10.849776 2.409154H2.400594V0.000001H10.849776C11.644471 0.000001 12.338899 -0.001059 12.901622 0.059909C13.486363 0.123352 14.071136 0.265493 14.598303 0.648292C14.886598 0.857751 15.141981 1.110984 15.351433 1.399281C15.734578 1.926807 15.876362 2.512925 15.939743 3.098105C16.000775 3.660718 15.99968 4.353347 15.99968 5.147807V13.599133H13.588429V5.147807Z',
  }],
}

/** Scissors (self-drawn ic_ds silhouette style) — cut: two finger rings
 *  and a pair of blades splayed toward the right. */
const CUT: Glyph = {
  viewBox: '0 0 16 16',
  size: 16,
  layers: [
    { d: 'M4.5 2.7a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8Z' },
    { d: 'M4.5 9.5a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8Z' },
    { d: 'M6.2 3.6L14.1 2.2l.4 1.3L6.6 5.4 6.2 3.6Z' },
    { d: 'M6.2 9.6L14.1 7.4l.4 1.3L6.6 11.7 6.2 9.6Z' },
  ],
}

/** Clipboard (self-drawn ic_ds silhouette style) — paste: a tabbed board
 *  with rounded corners. */
const PASTE: Glyph = {
  viewBox: '0 0 16 16',
  size: 16,
  layers: [{
    d: 'M6 2.8h4v.8h1.2a1.2 1.2 0 0 1 1.2 1.2v9a1.2 1.2 0 0 1-1.2 1.2H4.8a1.2 1.2 0 0 1-1.2-1.2v-9a1.2 1.2 0 0 1 1.2-1.2H6V2.8Z',
  }],
}

/** Folder with a plus badge (self-drawn) — new folder: the closed-folder
 *  glyph plus a plus centred on its body. */
const FOLDER_PLUS: Glyph = {
  viewBox: '0 0 16 16',
  size: 16,
  layers: [
    FOLDER_CLOSE.layers[0],
    { d: 'M7.3 6.5h1.4v.8h1.8v1.4H8.7v1.8H7.3V8.7H5.5V7.3h1.8V6.5Z' },
  ],
}

/** Picture frame (self-drawn ic_ds silhouette style) — paste image: a
 *  rounded frame with a sun circle and a mountain. */
const IMAGE: Glyph = {
  viewBox: '0 0 16 16',
  size: 16,
  layers: [
    {
      d: 'M2.9 3.4h10.2a1.1 1.1 0 0 1 1.1 1.1v7a1.1 1.1 0 0 1-1.1 1.1H2.9a1.1 1.1 0 0 1-1.1-1.1v-7a1.1 1.1 0 0 1 1.1-1.1Z',
    },
    { d: 'M5.4 5a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z' },
    { d: 'M3.5 11.4L7 7.9l2.2 2.2 1.9-1.9 2.6 2.6-0.5 0.6H3.5Z' },
  ],
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

export function plusIcon(size = 14): ReactNode {
  return svgIcon(PLUS, { size })
}

export function uploadIcon(size = 14): ReactNode {
  return svgIcon(UPLOAD, { size })
}

export function editIcon(size = 14): ReactNode {
  return svgIcon(EDIT, { size })
}

export function trashIcon(size = 14): ReactNode {
  return svgIcon(TRASH, { size })
}

/** Open arrow (points up-right). */
export function openIcon(size = 14): ReactNode {
  return svgIcon(OPEN, { size })
}

export function cutIcon(size = 14): ReactNode {
  return svgIcon(CUT, { size })
}

export function pasteIcon(size = 14): ReactNode {
  return svgIcon(PASTE, { size })
}

export function newFolderIcon(size = 14): ReactNode {
  return svgIcon(FOLDER_PLUS, { size })
}

/** Picture frame — paste a clipboard image. */
export function imageIcon(size = 14): ReactNode {
  return svgIcon(IMAGE, { size })
}

/** Open loading ring; consumers spin it with the .df-spin class. */
export function loadingIcon(size = 14, className?: string): ReactNode {
  return svgIcon(LOADING, { size, className })
}

export function warningIcon(size = 14): ReactNode {
  return svgIcon(WARNING, { size })
}

export function collapseAllIcon(size = 14): ReactNode {
  return svgIcon(COLLAPSE_ALL, { size })
}
