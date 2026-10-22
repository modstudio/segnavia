import type { OmittedImpositionMark } from '@segnavia/format'
import type { SlotPrintOptions } from '@segnavia/html'
import type { Page as Tab } from 'playwright-core'
import type { EffectsReport } from './effects/types.ts'
import type { PressReport } from './press/types.ts'

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

export interface Font {
  family: string
  data: Uint8Array
  format: 'woff2' | 'woff' | 'truetype' | 'opentype'
  weight?: number | string
  style?: 'normal' | 'italic'
}

export interface RenderLimits {
  maxSheets?: number
  maxBytes?: number
}

export interface RenderOptions {
  css?: string
  fonts?: Font[]
  limits?: RenderLimits
  boundMs?: number
  waitForPageReady?: boolean
  preferCssPageSize?: boolean
  beforeOutput?: (tab: Tab) => Promise<void>
  slots?: SlotPrintOptions
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

export interface ImageOptions extends RenderOptions {
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
