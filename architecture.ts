// The declared shape of the repository: what each package may import and
// where it may run. `scripts/checks/architecture.ts` enforces it; a boundary
// that is not written here is not a boundary.

export type Runtime = 'universal' | 'browser' | 'server'

export const SOURCE_CONDITION = '@segnavia/source'

export const REACT_PACKAGE_ALLOWLIST = new Set(['@segnavia/react'])
// The verify-render Bun leg proves Bun support for these packages.
export const BUN_SUPPORTED_PACKAGES = ['render', 'format', 'layout', 'html', 'capture'] as const
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
      'src/control-values.ts',
      'src/navigation-limit.ts',
      'src/svg.ts',
      'src/timeline.ts',
      'src/bridge.ts',
      'src/layout.ts',
      'src/layout-markers.ts',
      'src/layout-runtime.ts',
      'src/layout-selection.ts',
      'src/bridge-slot-fit.ts',
      'src/bridge-composition.ts',
      'src/composition-failure.ts',
      'src/bridge-message.ts',
      'src/document-slot-fit.ts',
      'src/embedded-preflight.ts',
      'src/bridge-selection.ts',
      'src/font-load.ts',
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
      'src/composer-side-note-measure.ts',
      'src/composer-margin.ts',
      'src/composer-margin-embed.ts',
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
    ],
  },
  capture: { runtime: 'server', imports: ['@segnavia/format', '@segnavia/frame', '@segnavia/render', 'playwright-core'] },
}

// A source file at the ceiling may only shrink: split out a concern instead.
export const FILE_CEILING_LINES = 400
