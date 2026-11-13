import { renderIssuePath } from '@segnavia/format'
import type { CoverImageOptions } from './cover-image.ts'
import { RenderRefusedError } from './errors.ts'
import type { PageImageOptions, ProofImageOptions } from './options.ts'
import type {
  BookPdfOptions,
  BookPlanOptions,
  DeckPdfInputOptions,
  PagePdfOptions,
  PagesPdfInputOptions,
  RenderCall,
  SlideImageInputOptions,
} from './renderer.ts'

const RENDER_KEYS = {
  newId: true,
  origins: true,
  assets: true,
  assetBudget: true,
  css: true,
  fonts: true,
  fontSource: true,
  brandSource: true,
  fontLoad: true,
  progress: true,
  localFonts: true,
  limits: true,
  boundMs: true,
  waitForPageReady: true,
  preferCssPageSize: true,
  beforeOutput: true,
  slots: true,
  placements: true,
  pageWidths: true,
  effects: true,
  overflow: true,
  marks: true,
  press: true,
} as const

const AS_OF_KEYS = { moment: true, anchors: true, asOf: true } as const
const IMAGE_KEYS = { motifs: true, format: true, proof: true, quality: true, scale: true, width: true, watermark: true } as const

export const BOOK_PDF_OPTION_KEYS = {
  ...RENDER_KEYS,
  preflight: true,
  protection: true,
  ...AS_OF_KEYS,
  motifs: true,
  plan: true,
  breaks: true,
  watermark: true,
} as const satisfies Record<keyof BookPdfOptions, true>

export const BOOK_PLAN_OPTION_KEYS = {
  ...RENDER_KEYS,
  ...AS_OF_KEYS,
  motifs: true,
  breaks: true,
} as const satisfies Record<keyof BookPlanOptions, true>

export const PAGE_PDF_OPTION_KEYS = {
  ...RENDER_KEYS,
  preflight: true,
  ...AS_OF_KEYS,
  protection: true,
  motifs: true,
  metadata: true,
  watermark: true,
} as const satisfies Record<keyof PagePdfOptions, true>

export const PAGES_PDF_OPTION_KEYS = {
  ...PAGE_PDF_OPTION_KEYS,
  imposition: true,
} as const satisfies Record<keyof PagesPdfInputOptions, true>

export const PAGE_IMAGE_OPTION_KEYS = {
  ...RENDER_KEYS,
  ...IMAGE_KEYS,
  preflight: true,
  ...AS_OF_KEYS,
} as const satisfies Record<keyof PageImageOptions, true>

export const COVER_IMAGE_OPTION_KEYS = {
  ...RENDER_KEYS,
  motifs: true,
  quality: true,
  watermark: true,
  preflight: true,
  ...AS_OF_KEYS,
  width: true,
  format: true,
} as const satisfies Record<keyof CoverImageOptions, true>

export const DECK_PDF_OPTION_KEYS = {
  ...RENDER_KEYS,
  preflight: true,
  protection: true,
  layout: true,
  notesPaper: true,
  imposition: true,
  title: true,
  labels: true,
  notesFont: true,
  inline: true,
  baseCss: true,
  nonce: true,
  omitHtmlSlideFrames: true,
  layoutScripts: true,
  ...AS_OF_KEYS,
  watermark: true,
} as const satisfies Record<keyof DeckPdfInputOptions, true>

export const SLIDE_IMAGE_OPTION_KEYS = {
  ...RENDER_KEYS,
  ...IMAGE_KEYS,
  preflight: true,
  ...AS_OF_KEYS,
  inline: true,
} as const satisfies Record<keyof SlideImageInputOptions, true>

export const PROOF_IMAGE_OPTION_KEYS = {
  profile: true,
  format: true,
} as const satisfies Record<keyof ProofImageOptions, true>

export type KnownOptionKeys = Readonly<Record<string, true>>

export const RENDER_OPTION_KEYS = {
  bookPdf: BOOK_PDF_OPTION_KEYS,
  bookPlan: BOOK_PLAN_OPTION_KEYS,
  pagePdf: PAGE_PDF_OPTION_KEYS,
  pagesPdf: PAGES_PDF_OPTION_KEYS,
  pageImage: PAGE_IMAGE_OPTION_KEYS,
  coverImage: COVER_IMAGE_OPTION_KEYS,
  deckPdf: DECK_PDF_OPTION_KEYS,
  slideImage: SLIDE_IMAGE_OPTION_KEYS,
  proofImage: PROOF_IMAGE_OPTION_KEYS,
} as const satisfies Record<RenderCall, KnownOptionKeys>

export function unknownOptionIssues(call: RenderCall, options: unknown, known: KnownOptionKeys, path: readonly PropertyKey[] = []): string[] {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return []
  return Object.keys(options)
    .filter((key) => !Object.hasOwn(known, key))
    .map((key) => `${call} ${renderIssuePath(['options', ...path, key])}: unknown option ${JSON.stringify(key)}; remove it to clear this refusal`)
}

export function refuseUnknownOptions(call: RenderCall, options: unknown): void {
  const issues = unknownOptionIssues(call, options, RENDER_OPTION_KEYS[call])
  if (issues.length > 0) throw new RenderRefusedError(issues.join('; '))
}

export function refuseUnknownNestedOptions(call: RenderCall, options: unknown, known: KnownOptionKeys, path: readonly PropertyKey[]): void {
  const issues = unknownOptionIssues(call, options, known, path)
  if (issues.length > 0) throw new RenderRefusedError(issues.join('; '))
}
