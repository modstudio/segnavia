export type PaginateNumberSystem = 'arabic' | 'roman-lower' | 'roman-upper' | 'hebrew'

export interface PaginateLine {
  top: number
  bottom: number
}

export interface PaginateNoteRef {
  note: string
  line: number
}

export interface PaginateBlock {
  kind: 'heading' | 'figure' | 'table' | 'text'
  tag: string
  position: { chapter: number; block: number }
  lines: PaginateLine[]
  keepWithNext?: boolean
  keepTogether?: boolean
  headerHeight?: number
  footnoteRefs?: PaginateNoteRef[]
}

export interface PaginateFlow {
  id: string
  kind: 'front' | 'contents' | 'chapter' | 'endnotes'
  runningHead?: string
  blocks: PaginateBlock[]
}

export interface PaginateNote {
  id: string
  lines: PaginateLine[]
}

export interface PaginateBookInput {
  flows: PaginateFlow[]
  notes: PaginateNote[]
  geometry: { textHeight: number; notesGap: number }
  settings: {
    orphans?: number
    widows?: number
    rectoOpenings: boolean
    direction: 'ltr' | 'rtl'
    sequences: { frontMatter: PaginateNumberSystem; body: PaginateNumberSystem }
    endnotePlacement: 'chapter' | 'book'
  }
}

export interface PaginateWindow {
  flow: string
  start: number
  end: number
}

export interface PaginatePageNote {
  id: string
  whole: boolean
  start: number
  end: number
}

export interface PaginateBookPage {
  kind: 'front' | 'body' | 'blank'
  number: number
  windows: PaginateWindow[]
  notes: PaginatePageNote[]
  headerRepeat?: number
  blank: boolean
  sectionOpening: boolean
  folio?: string
  runningHead?: string
}

export interface PaginateBookRefusal {
  tag: string
  position: { chapter: number; block: number }
  message: string
}

export interface PaginateBookResult {
  pages: PaginateBookPage[]
  refusals: PaginateBookRefusal[]
}

export interface PaginateUnit {
  flowId: string
  block: PaginateBlock
  index: number
  top: number
  bottom: number
  refs: string[]
}

export interface PaginatePageFill {
  placed: PaginateUnit[]
  fragments: PaginatePageNote[]
  index: number
  pending: PaginatePageNote[]
  refusal?: PaginateBookRefusal
  done?: boolean
}
