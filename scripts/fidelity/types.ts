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
}

export interface DocumentResult {
  id: string
  title: string
  pdf: string
  pdfBytes: number
  screen: string
  width: number
  height: number
  analysis: PdfAnalysis
  readers: ReaderResult[]
  pressPdf?: string
}

export interface FidelityRun {
  metadata: {
    label: string
    commit: string
    createdAt: string
    scale: number
    threshold: { mean: number; p99: number }
    chromium: string
  }
  documents: DocumentResult[]
}
