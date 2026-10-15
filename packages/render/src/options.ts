import type { Page as Tab } from 'playwright-core'
import type { EffectsReport } from './effects/types.ts'
import type { PressReport } from './press/types.ts'

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
  effects?: false | { report?: (report: EffectsReport) => void }
  press?: {
    profile: Uint8Array
    neutralTolerance?: number
    report?: (report: PressReport) => void
  }
}

export interface ImageOptions extends RenderOptions {
  format?: 'png' | 'jpeg' | 'webp'
  quality?: number[]
  scale?: number
  width?: number
}
