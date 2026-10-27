import type { PaginateBlock, PaginateBookInput, PaginateFlow, PaginateNote, PaginateWindow } from './paginate-types.ts'

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

export function note(id: string, count: number, height = lineHeight): PaginateNote {
  return { id, lines: lines(count, 0, height) }
}

export function input(overrides: Partial<PaginateBookInput> & Pick<PaginateBookInput, 'flows'>): PaginateBookInput {
  return {
    notes: [],
    geometry: { textHeight: 50, notesGap: 10 },
    settings: {
      rectoOpenings: false,
      direction: 'ltr',
      endnotePlacement: 'book',
    },
    ...overrides,
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
