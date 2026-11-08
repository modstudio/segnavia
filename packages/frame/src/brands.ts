import type { BrandSource } from '@segnavia/format'

export interface BrandsOptions {
  source: BrandSource
}

declare module './stage.ts' {
  interface SegnaviaStage {
    brands: BrandsOptions | undefined
  }
}
