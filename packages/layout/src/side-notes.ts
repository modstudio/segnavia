import type { Measurements, Plan, SideNotes } from '@segnavia/format'
import { resolveMarginSide } from './line-numbers.ts'

export interface PlacedSideNote {
  id: string
  top: number
  column: number
  columns: number
  side: 'left' | 'right'
}

export interface PageSideNotes {
  page: number
  notes: PlacedSideNote[]
}

type TiledPage = Plan['pages'][number] & { inlineTile?: number }

export function placeSideNotes(measurements: Measurements, plan: Plan, settings: SideNotes): readonly PageSideNotes[] {
  const sourcePages = (plan.pages as readonly TiledPage[]).filter((page) => page.inlineTile === undefined || page.inlineTile === 0)
  const sourceResult = sourcePages.map((_page, page) => ({ page, notes: [] as PlacedSideNote[] }))
  for (let pageIndex = 0; pageIndex < sourcePages.length; pageIndex += 1) {
    const page = sourcePages[pageIndex]
    if (!page) continue
    for (const window of page.windows) {
      const flow = measurements.flows.find((candidate) => candidate.id === window.flow)
      for (const note of flow?.sideNotes ?? []) {
        if (note.top < window.start || note.top >= window.end) continue
        sourceResult[pageIndex]?.notes.push({
          id: note.id,
          top: window.top + note.top - window.start,
          column: window.column,
          columns: window.columns,
          side: resolveMarginSide(settings.side, page, note.direction),
        })
      }
    }
  }
  let sourceIndex = -1
  return (plan.pages as readonly TiledPage[]).map((page, pageIndex) => {
    if (page.inlineTile === undefined || page.inlineTile === 0) sourceIndex += 1
    return { page: pageIndex, notes: sourceResult[sourceIndex]?.notes.map((note) => ({ ...note })) ?? [] }
  })
}

export function stackDownward(items: ReadonlyArray<{ top: number; height: number }>, gap = 0): number[] {
  let bottom = Number.NEGATIVE_INFINITY
  return items.map((item) => {
    const top = Math.max(item.top, bottom + gap)
    bottom = top + item.height
    return top
  })
}

export function placeSideNotesScript(): string {
  return `${placeSideNotes.toString()}\n${stackDownward.toString()}\nvar placeSideNotes=${placeSideNotes.name};var stackDownward=${stackDownward.name};`
}
