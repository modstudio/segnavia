import type {
  BookOpens,
  PaginateBlock as FormatPaginateBlock,
  PaginateFlow as FormatPaginateFlow,
  PaginateLine as FormatPaginateLine,
  PaginateNote as FormatPaginateNote,
  PaginateNoteRef as FormatPaginateNoteRef,
  PaginateNoteSeriesGeometry as FormatPaginateNoteSeriesGeometry,
  PaginatePageNote as FormatPaginatePageNote,
  PaginateWindow as FormatPaginateWindow,
  Measurements,
  PlanPage as SavedPlanPage,
  TextVariable,
} from '@segnavia/format'

export type PaginateSequence = NonNullable<FormatPaginateFlow['sequence']>

export type PaginatePageRole = SavedPlanPage['role']

export type PaginateLine = FormatPaginateLine
export type PaginateNoteRef = FormatPaginateNoteRef
export type PaginateBlock = FormatPaginateBlock

export type PaginateFlowParents = NonNullable<FormatPaginateFlow['parentRules']>

export type PaginateOpens = BookOpens

export type PaginateFlow = FormatPaginateFlow
export type PaginateNote = FormatPaginateNote
export type PaginateNoteSeriesGeometry = FormatPaginateNoteSeriesGeometry
export type PaginateBookInput = Measurements
export type PaginateWindow = FormatPaginateWindow
export type PaginatePageNote = FormatPaginatePageNote
export type PaginateTextVariable = TextVariable
export type PaginateBookPage = Omit<SavedPlanPage, 'start' | 'fingerprint'>

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
  decorationTop?: number
  decorationBottom?: number
  refs: string[]
  previousExtentEnd?: number
  nextExtentStart?: number
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
  geometry: { textHeight: number; notesGap: number; noteSeries?: PaginateNoteSeriesGeometry[] }
}

export type PaginateNotesOp =
  | (PaginateNotesBase & { op: 'space'; fragments: PaginatePageNote[] })
  | (PaginateNotesBase & { op: 'continue'; pending: PaginatePageNote[]; used: PaginateNotesUsed })
  | (PaginateNotesBase & { op: 'allocate'; placed: PaginateUnit[]; fragments: PaginatePageNote[]; unit: PaginateUnit; used: PaginateNotesUsed })
  | (PaginateNotesBase & { op: 'recompute'; placed: PaginateUnit[]; seed: PaginatePageNote[]; used: PaginateNotesUsed })
  | (PaginateNotesBase & { op: 'leftover'; fragments: PaginatePageNote[] })
