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

export interface PaginateFlowParents {
  opener?: string
  recto?: string
  verso?: string
  blank?: string
  fixed?: string
}

export type PaginateOpens = 'recto' | 'verso' | 'any'

interface PaginateFlowBase {
  id: string
  runningHead?: string
  opens?: PaginateOpens
  parents?: PaginateFlowParents
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
  parents?: PaginateFlowParents
}

// A refusal names the block it could not place, or the flow or note when no block is at fault.
export type PaginateBookRefusal =
  | { tag: string; position: { chapter: number; block: number }; message: string }
  | { flow: string; message: string }
  | { note: string; message: string }

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

export type PaginateNotesUsed = (placed: PaginateUnit[], fragments: PaginatePageNote[]) => number

interface PaginateNotesBase {
  notes: PaginateNote[]
  geometry: { textHeight: number; notesGap: number }
}

export type PaginateNotesOp =
  | (PaginateNotesBase & { op: 'space'; fragments: PaginatePageNote[] })
  | (PaginateNotesBase & { op: 'continue'; pending: PaginatePageNote[]; used: PaginateNotesUsed })
  | (PaginateNotesBase & { op: 'allocate'; placed: PaginateUnit[]; fragments: PaginatePageNote[]; unit: PaginateUnit; used: PaginateNotesUsed })
  | (PaginateNotesBase & { op: 'recompute'; placed: PaginateUnit[]; seed: PaginatePageNote[]; used: PaginateNotesUsed })
  | (PaginateNotesBase & { op: 'leftover'; fragments: PaginatePageNote[] })
