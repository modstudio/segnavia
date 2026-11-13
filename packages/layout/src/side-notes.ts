import type { Measurements, Plan, SideNotes } from '@segnavia/format'
import { resolveMarginSide } from './line-numbers.ts'
import { windowAnchorTop } from './tiled-pages.ts'

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

function placePageSideNotes(measurements: Measurements, page: Plan['pages'][number], pageIndex: number, settings: SideNotes, result: PageSideNotes[]): void {
  for (const window of page.windows) {
    const flow = measurements.flows.find((candidate) => candidate.id === window.flow)
    for (const note of flow?.sideNotes ?? []) {
      if (note.top < window.start || note.top >= window.end) continue
      const side = resolveMarginSide(settings.side, page, note.direction)
      result[pageIndex]?.notes.push({
        id: note.id,
        top: windowAnchorTop(window, note.top),
        column: window.column,
        columns: window.columns,
        side,
      })
    }
  }
}

export function placeSideNotes(measurements: Measurements, plan: Plan, settings: SideNotes, direction: 'ltr' | 'rtl'): readonly PageSideNotes[] {
  void direction
  const result = plan.pages.map((_page, page) => ({ page, notes: [] as PlacedSideNote[] }))
  for (const [pageIndex, page] of plan.pages.entries()) placePageSideNotes(measurements, page, pageIndex, settings, result)
  return result
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
  return `${windowAnchorTop.toString()}\n${resolveMarginSide.toString()}\n${placePageSideNotes.toString()}\n${placeSideNotes.toString()}\n${stackDownward.toString()}\nvar placeSideNotes=${placeSideNotes.name};var stackDownward=${stackDownward.name};`
}
