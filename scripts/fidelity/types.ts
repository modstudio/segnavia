export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface Difference {
  mean: number
  p99: number
}

export interface Threshold {
  mean: number
  p99: number
}

export interface BarResult<T> {
  measured?: T
  passed: boolean
  reason?: string
}

export interface SizeMeasurement {
  pdfBytes: number
  effectlessPdfBytes: number
  multiple: number
}

export interface AlignmentResult {
  offsetX: number
  offsetY: number
  referenceScore: number
  measuredScore: number
  passed: boolean
  error?: string
}

export interface GlyphBox {
  x: number
  y: number
  width: number
  height: number
}

export interface PosterVariantEvidence {
  variant: string
  screenCrop: string
  popplerCrop: string
  alignment: AlignmentResult
  lines: Array<{
    line: number
    screen: GlyphBox
    poppler: GlyphBox
    displacementX: number
    displacementY: number
    widthChange: number
    heightChange: number
  }>
}

export interface PosterEvidence {
  method: string
  variants: PosterVariantEvidence[]
  conclusion: string
}

export interface RegionResult extends Difference {
  name: string
  box: Box
  sideBySide?: string
}

export interface PdfImage {
  type: string
  width: number
  height: number
  xDpi: number
  yDpi: number
  bytes: number
}

export interface PdfAnalysis {
  vectorOps: boolean
  shadingTypes: number[]
  images: PdfImage[]
  softMasks: number
  transparencyGroups: number
}

export interface ReaderResult {
  reader: string
  engine: string
  worked: boolean
  colorProfile?: string
  error?: string
  image?: string
  page?: Difference
  regions?: RegionResult[]
  alignment?: AlignmentResult
}

export interface DocumentResult {
  id: string
  title: string
  pdf: string
  pdfBytes: number
  effectlessPdf: string
  effectlessPdfBytes: number
  screen: string
  width: number
  height: number
  comparisonBox: {
    screen: string
    readers: string
  }
  analysis: PdfAnalysis
  readers: ReaderResult[]
  pressPdf?: string
  pressProof?: string
  pressRaster?: string
  pressFlatDifference?: Difference
  pressBlendedDifference?: Difference
  pressReason?: string
  grayPressPdf?: string
  grayPressProof?: string
  grayPressRaster?: string
  grayPressFlatDifference?: Difference
  grayPressBlendedDifference?: Difference
  grayPressResidues?: number
  grayPressResidueErrors?: string[]
  grayPressReason?: string
  blendedMask: string
  blendedFraction: number
  bars: Record<BarId, BarResult<BarMeasurement>>
}

export type BarId = 'effects' | 'pressColorFlat' | 'pressColorBlended' | 'grayPressColorFlat' | 'grayPressColorBlended' | 'size'
export type BarMeasurement = Difference | SizeMeasurement

export interface FidelityRun {
  metadata: {
    label: string
    commit: string
    createdAt: string
    scale: number
    thresholds: Record<BarId, Threshold | { multiple: number; absoluteBytes: number }>
    chromium: string
    profile?: string
    grayProfile?: string
    pressRasterizer: {
      mode: 'ghostscript' | 'profiled-poppler'
      engine: string
      grayMode: 'profiled-poppler'
      grayEngine: string
      cmykSettings: string[]
      graySettings: string[]
      outputIntent: string
      displayProfile?: string
      cmykProfile?: string
      grayProfile?: string
    }
  }
  documents: DocumentResult[]
  posterEvidence?: PosterEvidence
}
