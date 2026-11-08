import { BOOK_PARENT_NAMES } from '@segnavia/format'
import type { PaginateBlock, PaginateBookInput, PaginateFlow, PaginateNote, PaginateNoteSeriesGeometry, PaginateWindow } from './paginate-types.ts'

export const lineHeight = 10

export function lines(count: number, start = 0, height = lineHeight) {
  return Array.from({ length: count }, (_, index) => ({ top: start + index * height, bottom: start + (index + 1) * height }))
}

export function block(
  kind: PaginateBlock['kind'],
  tag: string,
  chapter: number,
  index: number,
  count: number,
  start: number,
  extra: Partial<PaginateBlock> = {},
): PaginateBlock {
  return { kind, tag, position: { chapter, block: index }, lines: lines(count, start), ...extra }
}

export function flow(id: string, kind: Exclude<PaginateFlow['kind'], 'fixed'>, blocks: PaginateBlock[], runningHead?: string): PaginateFlow {
  return { id, kind, blocks, ...(runningHead === undefined ? {} : { runningHead }) }
}

export function note(id: string, count: number, height = lineHeight, series = 'footnote'): PaginateNote {
  return { id, series, lines: lines(count, 0, height) }
}

type InputOverrides = Omit<Partial<PaginateBookInput>, 'geometry' | 'parents' | 'parentNames'> &
  Pick<PaginateBookInput, 'flows'> & { geometry?: { textHeight: number; notesGap: number; noteSeries?: PaginateNoteSeriesGeometry[] } }

export function input(overrides: InputOverrides): PaginateBookInput {
  const geometry = overrides.geometry ?? { textHeight: 50, notesGap: 10 }
  const { geometry: _geometry, ...rest } = overrides
  const area = { width: 100, height: geometry.textHeight }
  return {
    notes: [],
    geometry: { notesGap: geometry.notesGap, ...(geometry.noteSeries ? { noteSeries: geometry.noteSeries } : {}) },
    parents: Object.fromEntries(Object.values(BOOK_PARENT_NAMES).map((name) => [name, area])),
    parentNames: BOOK_PARENT_NAMES,
    settings: {
      rectoOpenings: false,
      direction: 'ltr',
      endnotePlacement: 'book',
    },
    ...rest,
  }
}

export function win(id: string, start: number, end: number, top: number, column = 0, columns = 1): PaginateWindow {
  return { flow: id, start, end, top, column, columns }
}

export const settings = {
  rectoOpenings: true as const,
  direction: 'ltr' as const,
  endnotePlacement: 'book' as const,
}
