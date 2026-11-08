import {
  type BrandSource,
  type Deck,
  exceedsLimits,
  type FontFace,
  type FontFailure,
  type FontSource,
  type Limits,
  type OmittedImpositionMark,
  PageWidths,
  parseLimits,
} from '@segnavia/format'
import type { MotifsOptions, PlacementsOptions } from '@segnavia/frame/motifs'
import type { SlotPrintOptions } from '@segnavia/html'
import type { Page as Tab } from 'playwright-core'
import type { EffectsReport } from './effects/types.ts'
import { RenderRefusedError } from './errors.ts'
import type { LocalFontsOptions } from './local-fonts.ts'
import type { PressReport } from './press/types.ts'

export type Font = FontFace

export interface AssetAnswer {
  body: Uint8Array
  contentType: string
}

export type Assets = (url: string, options: { kind: import('@segnavia/format').FetchKind; signal: AbortSignal }) => Promise<AssetAnswer | undefined>

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
  localFonts?: LocalFontsOptions
  limits?: Limits
  boundMs?: number
  waitForPageReady?: boolean
  preferCssPageSize?: boolean
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
}

export function parseRenderOptions<T extends RenderOptions>(options: T): T {
  if (typeof options.localFonts === 'object' && options.localFonts !== null && 'limits' in options.localFonts) {
    parseLimits({ localFonts: { limits: options.localFonts.limits } }, 'host')
  }
  return {
    ...options,
    assetBudget: { bytes: 0 },
    limits: parseLimits(options.limits, 'host'),
    ...(options.pageWidths === undefined ? {} : { pageWidths: PageWidths.parse(options.pageWidths) }),
  }
}

export function innerLimits(limits: Limits | undefined): Limits | undefined {
  if (limits === undefined) return undefined
  return {
    ...(limits.pages === undefined ? {} : { pages: limits.pages }),
    ...(limits.localFonts === undefined ? {} : { localFonts: limits.localFonts }),
    ...(limits.assets === undefined ? {} : { assets: limits.assets }),
  }
}

/** Slot printing renders one copy per fill; a lone copy is the whole output, so it carries the whole output's limits. */
export function copyLimits(limits: Limits | undefined, slots: SlotPrintOptions | undefined): Limits | undefined {
  return (slots?.fills?.length ?? 1) === 1 ? limits : innerLimits(limits)
}

export function enforceDeckLimits(deck: Deck, limits: Limits | undefined): void {
  const reasons = exceedsLimits(deck, limits ?? {})
  if (reasons.length > 0) throw new RenderRefusedError(reasons.join('; '))
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

export interface ProofImageOptions {
  profile: Uint8Array
  format?: 'png' | 'jpeg' | 'webp'
}

import type { OriginApproval } from '@segnavia/format'
