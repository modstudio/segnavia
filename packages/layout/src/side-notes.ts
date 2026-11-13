import type { Measurements, Plan, SideNotes } from '@segnavia/format'
import { resolveMarginSide } from './line-numbers.ts'
import { tiledPageGroups, windowAnchorTop } from './tiled-pages.ts'

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

function placeSourcePageSideNotes(
  measurements: Measurements,
  group: ReturnType<typeof tiledPageGroups>[number],
  settings: SideNotes,
  direction: 'ltr' | 'rtl',
  result: PageSideNotes[],
): void {
  const page = group.tiles[0].page
  for (const window of page.windows) {
    const flow = measurements.flows.find((candidate) => candidate.id === window.flow)
    for (const note of flow?.sideNotes ?? []) {
      if (note.top < window.start || note.top >= window.end) continue
      const side = resolveMarginSide(settings.side, page, note.direction)
      const inlineStart = direction === 'ltr' ? 'left' : 'right'
      const tile = group.tiles[side === inlineStart ? 0 : group.tiles.length - 1]
      if (!tile) continue
      result[tile.index]?.notes.push({
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
  const groups = tiledPageGroups(plan)
  const result = plan.pages.map((_page, page) => ({ page, notes: [] as PlacedSideNote[] }))
  for (const group of groups) placeSourcePageSideNotes(measurements, group, settings, direction, result)
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
  return `${tiledPageGroups.toString()}\n${windowAnchorTop.toString()}\n${resolveMarginSide.toString()}\n${placeSourcePageSideNotes.toString()}\n${placeSideNotes.toString()}\n${stackDownward.toString()}\nvar placeSideNotes=${placeSideNotes.name};var stackDownward=${stackDownward.name};`
}
