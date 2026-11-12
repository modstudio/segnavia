import {
  type BrandSource,
  type ComposeProgress,
  type Deck,
  deckLimitsExceeded,
  type FetchKind,
  type FontFace,
  type FontFailure,
  type FontSource,
  type Limits,
  type OmittedImpositionMark,
  type OriginApproval,
  type Page,
  PageWidths,
  parseLimits,
} from '@segnavia/format'
import type { MotifsOptions, PlacementsOptions } from '@segnavia/frame/motifs'
import { type AsOfInputs, type HtmlPage, isPrintedHtmlPage, type PrintedHtmlPage, type SlotPrintOptions } from '@segnavia/html'
import type { Page as Tab } from 'playwright-core'
import type { EffectsReport } from './effects/types.ts'
import { RenderLimitError, RenderRefusedError } from './errors.ts'
import type { LocalFontsOptions } from './local-fonts.ts'
import { type ComposedPreflight, type RenderPreflightOptions, resolveRenderPreflight } from './preflight.ts'
import type { PressReport } from './press/types.ts'
import type { RenderProgressOptions } from './progress.ts'
import { type Protection, parseProtection } from './protection-options.ts'

export type Font = FontFace

export interface AssetAnswer {
  body: Uint8Array
  contentType: string
}

export type Assets = (url: string, options: { kind: FetchKind; signal: AbortSignal }) => Promise<AssetAnswer | undefined>

export interface AssetBudget {
  bytes: number
}

export type OverflowPart = 'page' | 'front' | 'body' | 'margin'

export interface OverflowContribution {
  /** A short id or tag-and-class path locating the element. */
  locator: string
  /** Border-box pixels clipped beyond the inline start of the page. */
  clippedStart: number
  /** Border-box pixels clipped beyond the inline end of the page. */
  clippedEnd: number
}

export interface OverflowEntry {
  /** Output part printed by this entry. */
  part: OverflowPart
  /** Input position when the public render is pagesPdf. */
  inputIndex?: number
  /** Printable inline width in CSS pixels. */
  pageWidth: number
  /** Greatest document scroll width in CSS pixels. */
  extent: number
  /** Pixels clipped beyond the inline start of the page. */
  clippedStart: number
  /** Pixels clipped beyond the inline end of the page. */
  clippedEnd: number
  /** PDF scale used to preserve the print's true size. */
  scale: number
  /** Up to twenty border boxes that extend beyond the page. */
  elements: OverflowContribution[]
}

export interface OverflowReport {
  /** Kept prints in output order. */
  entries: OverflowEntry[]
}

export interface MarksReport {
  omittedMarks: OmittedImpositionMark[]
}

export interface RenderOptions {
  newId?: () => string
  origins?: Iterable<OriginApproval>
  assets?: Assets
  /** @internal Shared by every browser tab opened for one render call. */
  assetBudget?: AssetBudget
  css?: string
  fonts?: Font[]
  fontSource?: FontSource
  brandSource?: BrandSource
  fontLoad?: { report?: (report: { failures: FontFailure[] }) => void }
  progress?: RenderProgressOptions
  localFonts?: LocalFontsOptions
  limits?: Limits
  boundMs?: number
  waitForPageReady?: boolean
  preferCssPageSize?: boolean
  /**
   * Receives the live page after render readiness and before output.
   *
   * The hook runs under the page's script policy. With `scripts: 'refuse'`,
   * that policy deliberately allows only nonce-bearing scripts, so CSP refuses
   * an inline script added with `tab.addScriptTag({ content })`; use
   * `tab.evaluate` to run hook code in the page. With `scripts: 'sandboxed'`,
   * author inline scripts are allowed, but hooks should still use `tab.evaluate`.
   * The nonce is not exposed.
   */
  beforeOutput?: (tab: Tab) => Promise<void>
  slots?: SlotPrintOptions
  placements?: PlacementsOptions
  pageWidths?: PageWidths
  effects?:
    | false
    | {
        raster?: { dpi?: number; quality?: number }
        report?: (report: EffectsReport) => void
      }
  overflow?: { report?: (report: OverflowReport) => void }
  marks?: { report?: (report: MarksReport) => void }
  press?: {
    /** Whether authored raster images are left for the printer or converted through the press profile. */
    images?: 'keep' | 'convert'
    /** How converted rasters are stored. Default lossless is Flate; jpeg writes four-channel CMYK as baseline DCTDecode. */
    imageEncoding?: 'lossless' | 'jpeg'
    /** JPEG quality 1 to 100, default 85; only with imageEncoding: 'jpeg'. */
    imageQuality?: number
    profile: Uint8Array
    neutralTolerance?: number
    report?: (report: PressReport) => void
  }
  protection?: Protection
}

export function parseRenderOptions<T extends RenderOptions>(options: T): Omit<T, 'progress'> & RenderOptions {
  if (typeof options.localFonts === 'object' && options.localFonts !== null && 'limits' in options.localFonts) {
    parseLimits({ localFonts: { limits: options.localFonts.limits } }, 'host')
  }
  return {
    ...options,
    origins: options.origins === undefined ? undefined : [...options.origins],
    assetBudget: { bytes: 0 },
    limits: parseLimits(options.limits, 'host'),
    progress: parseRenderProgress(options.progress),
    protection: parseProtection(options.protection),
    ...(options.pageWidths === undefined ? {} : { pageWidths: PageWidths.parse(options.pageWidths) }),
  }
}

function parseRenderProgress(value: unknown): RenderProgressOptions | undefined {
  if (value === undefined) return undefined
  const report = value && typeof value === 'object' && !Array.isArray(value) ? (value as { report?: unknown }).report : undefined
  if (typeof report !== 'function') {
    throw new RenderRefusedError('The progress option needs a report function; pass progress: { report(progress) {} }, or omit progress to clear this refusal.')
  }
  return { report: report as (progress: ComposeProgress) => void }
}

export function innerLimits(limits: Limits | undefined): Limits | undefined {
  if (limits === undefined) return undefined
  return {
    ...(limits.pages === undefined ? {} : { pages: limits.pages }),
    ...(limits.localFonts === undefined ? {} : { localFonts: limits.localFonts }),
    ...(limits.assets === undefined ? {} : { assets: limits.assets }),
  }
}

export function pageCompositionCount(pages: readonly (Page | HtmlPage | PrintedHtmlPage)[], slots?: Pick<SlotPrintOptions, 'fills'>): number {
  const copies = slots?.fills?.length ?? 1
  return pages.filter((page) => isPrintedHtmlPage(page) || page.printedPages !== undefined).length * copies
}

export function refuseProgressUnlessOneComposition(options: Pick<RenderOptions, 'progress'>, compositions: number): void {
  if (!options.progress || compositions === 1) return
  if (compositions === 0) {
    throw new RenderRefusedError(
      'The progress option is reported by a paginated book or a printed page; this render runs no composer. Omit progress to clear this refusal.',
    )
  }
  throw new RenderRefusedError(
    `The progress option is reported per single composition; this render runs ${compositions} compositions. Omit progress and render one paginated book or printed page at a time to clear this refusal.`,
  )
}

/** Slot printing renders one copy per fill; a lone copy is the whole output, so it carries the whole output's limits. */
export function copyLimits(limits: Limits | undefined, slots: SlotPrintOptions | undefined): Limits | undefined {
  return (slots?.fills?.length ?? 1) === 1 ? limits : innerLimits(limits)
}

export function enforceDeckLimits(deck: Deck, limits: Limits | undefined): void {
  const exceeded = deckLimitsExceeded(deck, limits ?? {})
  if (exceeded.length > 0) throw new RenderLimitError(exceeded as [(typeof exceeded)[number], ...typeof exceeded])
}

export const assetSetup = (options: RenderOptions): Pick<RenderOptions, 'origins' | 'assets' | 'assetBudget' | 'limits'> => ({
  origins: options.origins,
  assets: options.assets,
  assetBudget: options.assetBudget,
  limits: options.limits,
})

export interface ImageOptions extends RenderOptions {
  motifs?: MotifsOptions
  format?: 'png' | 'jpeg' | 'webp'
  proof?: { profile: Uint8Array }
  quality?: number[]
  scale?: number
  width?: number
}

export interface PageImageOptions extends ImageOptions, AsOfInputs {
  preflight?: RenderPreflightOptions
}

export type ComposedRenderInput = RenderOptions & { preflight?: RenderPreflightOptions }

export type SlideImageOptions = ImageOptions & ComposedRenderInput & AsOfInputs

export type ComposedRenderOptions = RenderOptions & { preflight?: ComposedPreflight }

export type ParsedComposedRenderOptions<T extends ComposedRenderInput> = Omit<T, 'preflight' | 'progress'> & ComposedRenderOptions

export function parseComposedRenderOptions<T extends ComposedRenderInput>(options: T): ParsedComposedRenderOptions<T> {
  const parsed = parseRenderOptions(options)
  const preflight = resolveRenderPreflight(options.preflight)
  return { ...parsed, ...(preflight === undefined ? {} : { preflight }) } as ParsedComposedRenderOptions<T>
}

export type PageRenderOptions = ComposedRenderInput & AsOfInputs

export type ParsedPageRenderOptions = ComposedRenderOptions & AsOfInputs

export type ParsedPageImageOptions = ParsedComposedRenderOptions<PageImageOptions>

export interface ProofImageOptions {
  profile: Uint8Array
  format?: 'png' | 'jpeg' | 'webp'
}
