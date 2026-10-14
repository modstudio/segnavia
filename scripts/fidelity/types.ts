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
  passed: boolean
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
  worked: boolean
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
  analysis: PdfAnalysis
  readers: ReaderResult[]
  pressPdf?: string
  pressProof?: string
  pressRaster?: string
  bars: {
    effects: BarResult<Difference>
    pressColor: BarResult<Difference>
    size: BarResult<SizeMeasurement>
  }
}

export interface FidelityRun {
  metadata: {
    label: string
    commit: string
    createdAt: string
    scale: number
    thresholds: {
      effects: Threshold
      pressColor: Threshold
      size: { multiple: number; absoluteBytes: number }
    }
    chromium: string
    profile?: string
  }
  documents: DocumentResult[]
}
