// The declared shape of the repository: what each package may import and
// where it may run. `scripts/checks/architecture.ts` enforces it; a boundary
// that is not written here is not a boundary.

import { ADDITIONAL_DRAWING_INPUTS } from './drawing-input-paths.ts'

export type Runtime = 'universal' | 'browser' | 'server'

export const SOURCE_CONDITION = '@segnavia/source'

export const REACT_PACKAGE_ALLOWLIST = new Set(['@segnavia/react'])
// The verify-render Bun leg proves Bun support for these packages.
export const BUN_SUPPORTED_PACKAGES = ['render', 'format', 'layout', 'html', 'capture'] as const

// Source that can change the pixels or encoding produced by pageImage, slideImage or coverImage.
// The drawing-input check fingerprints these paths; the coverage test keeps their import boundary complete.
const PRIMARY_DRAWING_INPUTS = [
  'packages/frame/src/base-style.ts',
  'packages/frame/src/book-presentation.ts',
  'packages/frame/src/bridge.ts',
  'packages/frame/src/composer-dress.ts',
  'packages/frame/src/composer-decoration.ts',
  'packages/frame/src/composer-fill.ts',
  'packages/frame/src/composer-fill-policy.ts',
  'packages/frame/src/composer-fit.ts',
  'packages/frame/src/composer-fit-policy.ts',
  'packages/frame/src/composer-hj-violations.ts',
  'packages/frame/src/composer-inline-overflow.ts',
  'packages/frame/src/composer-line-labels-embed.ts',
  'packages/frame/src/composer-line-label-measure.ts',
  'packages/frame/src/composer-line-labels.ts',
  'packages/frame/src/composer-line-range.ts',
  'packages/frame/src/composer-margin.ts',
  'packages/frame/src/composer-margin-embed.ts',
  'packages/frame/src/composer-measure-embed.ts',
  'packages/frame/src/composer-measure.ts',
  'packages/frame/src/composer-page-dom.ts',
  'packages/frame/src/composer-paragraph.ts',
  'packages/frame/src/composer-paragraph-box.ts',
  'packages/frame/src/composer-paragraph-dom.ts',
  'packages/frame/src/composer-paragraph-measure.ts',
  'packages/frame/src/composer-paragraph-performance.ts',
  'packages/frame/src/composer-paragraph-policy.ts',
  'packages/frame/src/composer-preflight.ts',
  'packages/frame/src/composer-progress.ts',
  'packages/frame/src/composer-properties-embed.ts',
  'packages/frame/src/composer-properties-policy.ts',
  'packages/frame/src/composer-properties.ts',
  'packages/frame/src/composer-regions.ts',
  'packages/frame/src/composer-side-note-measure.ts',
  'packages/frame/src/composer-source-staging.ts',
  'packages/frame/src/composer-stage-policy.ts',
  'packages/frame/src/composer-table-measure.ts',
  'packages/frame/src/composer-tags.ts',
  'packages/frame/src/composer-title-values.ts',
  'packages/frame/src/composer-window-placement.ts',
  'packages/frame/src/composer.ts',
  'packages/frame/src/frame-style-sheets.ts',
  'packages/frame/src/layout-runtime.ts',
  'packages/frame/src/layout-settle.ts',
  'packages/frame/src/print-document.ts',
  'packages/frame/src/printed-page-document.ts',
  'packages/frame/src/slide-print-document.ts',
  'packages/html/src/sanitize.ts',
  'packages/layout/src/index.ts',
  'packages/render/src/browser-tab.ts',
  'packages/render/src/capture-image.ts',
  'packages/render/src/image-watermark.ts',
  'packages/render/src/no-network-args.ts',
  'packages/render/src/page-document.ts',
  'packages/render/src/page-image-render.ts',
  'packages/render/src/page-paper.ts',
  'packages/render/src/page-viewport.ts',
  'packages/render/src/printed-page-render.ts',
  'packages/render/src/proof-image.ts',
  'packages/render/src/slide-image.ts',
] as const

// Drawing modules reached transitively from the public picture paths. The coverage test follows
// relative, frame and layout imports, including imports made by explicitly non-drawing modules.

export const DRAWING_INPUTS = [...PRIMARY_DRAWING_INPUTS, ...ADDITIONAL_DRAWING_INPUTS] as const

// Reachable modules that can only report or refuse a render; changing them cannot alter a successful picture.
export const NON_DRAWING_INPUTS = [
  'packages/frame/src/composition-failure.ts',
  'packages/frame/src/document-brand-refusal.ts',
  'packages/frame/src/embedded-preflight.ts',
  'packages/render/src/asset-refusal.ts',
  'packages/render/src/errors.ts',
  'packages/render/src/preflight.ts',
  'packages/render/src/progress.ts',
  'packages/render/src/render-deadline.ts',
  'packages/render/src/renderer.ts',
] as const
export const VUE_TYPE_ENTRIES = {
  frame: { exportName: './vue', source: 'src/vue.ts' },
  'markdown-editor': { exportName: './vue', source: 'src/vue.ts' },
} as const
export const RUNTIME_EMPTY_TYPE_ENTRIES = [
  { packageName: 'frame', exportName: './vue-types' },
  ...Object.entries(VUE_TYPE_ENTRIES).map(([packageName, entry]) => ({ packageName, exportName: entry.exportName })),
]
export const VUE_MODULE_NAMES = ['vue', 'vue-tsc', '@vue'] as const

export type SourceExport = string | { bun: string; node: string; default: string }

export function entrySpecifier(packageName: string, exportName: string): string {
  return exportName === '.' ? packageName : `${packageName}${exportName.slice(1)}`
}

export function bunSource(source: SourceExport): string {
  return typeof source === 'string' ? source : source.bun
}

export const platformForRuntime = (runtime: Runtime): 'browser' | 'node' | 'neutral' =>
  runtime === 'server' ? 'node' : runtime === 'browser' ? 'browser' : 'neutral'

export interface PackageRule {
  // universal: runs in a browser and on a server, so no Node built-ins.
  // browser: may use the DOM. server: may use Node built-ins.
  runtime: Runtime
  // Every package this one may import, by bare name. A workspace package may
  // be imported only through an entry point its package.json exports.
  imports: string[]
  // Packages the build imports only to inline them into published output.
  bundles?: string[]
  // Entry points that must stay importable on a server although the package
  // as a whole is for the browser, with the files each may reach.
  serverSafe?: string[]
}

export function sourceRuntime(rule: PackageRule, source: string): Runtime {
  return rule.runtime === 'browser' && rule.serverSafe?.includes(source) ? 'universal' : rule.runtime
}

export function entryRuntime(packageName: string, exportName: string, rule: PackageRule, source: string): Runtime | 'types only' {
  return RUNTIME_EMPTY_TYPE_ENTRIES.some((entry) => entry.packageName === packageName && entry.exportName === exportName)
    ? 'types only'
    : sourceRuntime(rule, source)
}

export const PACKAGES: Record<string, PackageRule> = {
  // Board placement geometry stays universal because callers supply every measured shape.
  format: { runtime: 'universal', imports: ['zod'] },
  layout: { runtime: 'universal', imports: ['@segnavia/format'] },
  html: {
    runtime: 'universal',
    imports: [
      '@segnavia/format',
      '@segnavia/layout',
      'zod',
      'htmlparser2',
      'domhandler',
      'dom-serializer',
      'qrcode-generator',
      'unified',
      'remark-parse',
      'remark-gfm',
      'remark-frontmatter',
      'remark-directive',
      'remark-rehype',
      'rehype-stringify',
      'yaml',
    ],
  },
  idml: { runtime: 'universal', imports: ['@segnavia/format', '@segnavia/html', 'htmlparser2', 'domhandler', 'dom-serializer'] },
  diagrams: {
    runtime: 'browser',
    imports: ['@segnavia/format', '@segnavia/frame'],
    bundles: ['mermaid'],
    // The provider and explicit script entries are server-safe; auto registration is browser-only.
    serverSafe: ['src/index.ts', 'src/script.ts', 'src/runtime.ts'],
  },
  'markdown-editor': {
    runtime: 'browser',
    imports: [
      '@segnavia/frame',
      '@segnavia/format',
      '@segnavia/html',
      '@codemirror/commands',
      '@codemirror/lang-markdown',
      '@codemirror/language',
      '@codemirror/language-data',
      '@codemirror/state',
      '@codemirror/view',
      '@lezer/highlight',
      '@lezer/markdown',
      '@tiptap/core',
      '@tiptap/extension-image',
      '@tiptap/extension-list',
      '@tiptap/extension-table',
      '@tiptap/markdown',
      '@tiptap/pm',
      '@tiptap/starter-kit',
      'codemirror-lang-mermaid',
      'marked',
    ],
  },
  frame: {
    runtime: 'browser',
    imports: ['@segnavia/format', '@segnavia/html', '@segnavia/layout'],
    // Optional browser entries (package.json): authoring, deck, page, printed-pages, document-authoring, board-editing, item-settings and local-fonts.
    serverSafe: [
      'src/deck-model.ts',
      'src/deck-refusal.ts',
      'src/control-values.ts',
      'src/navigation-limit.ts',
      'src/svg.ts',
      'src/timeline.ts',
      'src/bridge.ts',
      'src/bridge-cue.ts',
      'src/frame-message-types.ts',
      'src/layout.ts',
      'src/layout-markers.ts',
      'src/layout-runtime.ts',
      'src/layout-selection.ts',
      'src/bridge-slot-fit.ts',
      'src/bridge-composition.ts',
      'src/composition-failure.ts',
      'src/composer-tags.ts',
      'src/bridge-message.ts',
      'src/document-slot-fit.ts',
      'src/embedded-preflight.ts',
      'src/bridge-selection.ts',
      'src/font-load.ts',
      'src/field-style.ts',
      'src/frame-style-sheets.ts',
      'src/keep-gap.ts',
      'src/keep-pass.ts',
      'src/animation-timing.ts',
      'src/fit.ts',
      'src/image-fit.ts',
      'src/deck-press.ts',
      'src/notes-layout.ts',
      'src/deck-folios.ts',
      'src/stage-layout.ts',
      'src/stage-refusal.ts',
      'src/deck-placement-resolution.ts',
      'src/print-document.ts',
      'src/imposed-paper.ts',
      'src/document-brand-refusal.ts',
      'src/slide-print-document.ts',
      'src/printed-page-document.ts',
      'src/printed-page-geometry.ts',
      'src/printed-parent-selection.ts',
      'src/layout-settle.ts',
      'src/composer-decoration.ts',
      'src/composer-fit.ts',
      'src/composer-fit-policy.ts',
      'src/composer-inline-overflow.ts',
      'src/composer-hj-violations.ts',
      'src/composer-axis-policy.ts',
      'src/composer-fill.ts',
      'src/composer-fill-policy.ts',
      'src/composer-page-dom.ts',
      'src/composer-line-range.ts',
      'src/composer-line-label-measure.ts',
      'src/composer-line-labels.ts',
      'src/composer-line-labels-embed.ts',
      'src/composer-measure.ts',
      'src/composer-measure-embed.ts',
      'src/composer-table-measure.ts',
      'src/composer-title-values.ts',
      'src/composer-side-note-measure.ts',
      'src/composer-margin.ts',
      'src/composer-margin-embed.ts',
      'src/composer-paragraph-box.ts',
      'src/composer-paragraph-dom.ts',
      'src/composer-paragraph-measure.ts',
      'src/composer-paragraph-performance.ts',
      'src/composer-paragraph-policy.ts',
      'src/composer-paragraph.ts',
      'src/line-number-style.ts',
      'src/composer-properties.ts',
      'src/composer-properties-embed.ts',
      'src/composer-properties-policy.ts',
      'src/composer-source-staging.ts',
      'src/composer-stage-policy.ts',
      'src/composer-dress.ts',
      'src/composer-preflight.ts',
      'src/composer-progress.ts',
      'src/composer-regions.ts',
      'src/composer-window-placement.ts',
      'src/composer.ts',
      'src/book-presentation.ts',
      'src/book-document.ts',
      'src/book-view-document.ts',
      'src/book-page-geometries.ts',
      'src/book-entry-resolution.ts',
      'src/motif-expansion.ts',
      'src/page-motif-expansion.ts',
      'src/printed-page-expansion.ts',
      'src/placement-resolution.ts',
      'src/page-fonts.ts',
      'src/slot-render.ts',
      'src/styled-elements.ts',
      'src/headless-elements.ts',
      'src/element-properties.ts',
      'src/icons.ts',
      'src/diagram-document.ts',
      'src/page-document-loading.ts',
      'src/shown-page-document.ts',
    ],
  },
  react: { runtime: 'browser', imports: ['@segnavia/frame', '@segnavia/markdown-editor', 'react', 'react-dom'] },
  voice: { runtime: 'server', imports: ['@segnavia/format'] },
  render: {
    runtime: 'server',
    imports: [
      '@neslinesli93/qpdf-wasm',
      '@segnavia/diagrams',
      '@segnavia/format',
      '@segnavia/frame',
      '@segnavia/html',
      '@segnavia/layout',
      'playwright-core',
      'pdf-lib',
      'pdfjs-dist',
    ],
  },
  capture: { runtime: 'server', imports: ['@segnavia/format', '@segnavia/frame', '@segnavia/render', 'playwright-core'] },
}

// A source file at the ceiling may only shrink: split out a concern instead.
export const FILE_CEILING_LINES = 400
