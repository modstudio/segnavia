export type PaginateSequence = 'front' | 'body'

export type PaginatePageRole = 'opener' | 'body' | 'blank' | 'fixed'

export interface PaginateLine {
  top: number
  bottom: number
}

export interface PaginateNoteRef {
  note: string
  line: number
}

export interface PaginateMark {
  name: string
  value: string
  line: number
}

export interface PaginateBlock {
  kind: 'heading' | 'figure' | 'table' | 'text'
  tag: string
  position: { chapter: number; block: number }
  lines: PaginateLine[]
  columns?: number
  orphans?: number
  widows?: number
  keepWithNext?: boolean
  keepTogether?: boolean
  headerHeight?: number
  footnoteRefs?: PaginateNoteRef[]
  marks?: PaginateMark[]
}

interface PaginateFlowBase {
  id: string
  runningHead?: string
  parents?: { opener?: string; body?: string }
}

export type PaginateFlow =
  | (PaginateFlowBase & { kind: 'front' | 'contents' | 'chapter' | 'endnotes'; blocks: PaginateBlock[] })
  | (PaginateFlowBase & { kind: 'fixed'; pages: number; sequence?: PaginateSequence })

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
    endnotePlacement: 'chapter' | 'book'
  }
}

export interface PaginateWindow {
  flow: string
  start: number
  end: number
  top: number
  column: number
  columns: number
}

export interface PaginatePageNote {
  id: string
  whole: boolean
  start: number
  end: number
}

export type PaginatePageMarks = Record<string, { first: string; last: string }>

export interface PaginateBookPage {
  kind: 'front' | 'body' | 'blank'
  number: number
  sequence: PaginateSequence
  flow: string
  role: PaginatePageRole
  windows: PaginateWindow[]
  notes: PaginatePageNote[]
  headerRepeat?: number
  blank: boolean
  sectionOpening: boolean
  runningHead?: string
  marks?: PaginatePageMarks
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
  prevBottom?: number
  nextTop?: number
}

export interface PaginatePageFill {
  placed: PaginateUnit[]
  fragments: PaginatePageNote[]
  index: number
  pending: PaginatePageNote[]
  refusal?: PaginateBookRefusal
  done?: boolean
}

export interface PaginateNotesPayload {
  notes: PaginateNote[]
  geometry: { textHeight: number; notesGap: number }
  fragments?: PaginatePageNote[]
  pending?: PaginatePageNote[]
  placed?: PaginateUnit[]
  unit?: PaginateUnit
  seed?: PaginatePageNote[]
  used?: (placed: PaginateUnit[], fragments: PaginatePageNote[]) => number
}
