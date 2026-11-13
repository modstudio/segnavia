import type { Plan } from '@segnavia/format'

export type TiledPlanPage = Plan['pages'][number] & { inlineTile?: number }

export interface PlanPageTile {
  index: number
  page: TiledPlanPage
}

export interface PlanPageTiles {
  sourceIndex: number
  tiles: PlanPageTile[]
}

/** Enumerates each source page together with its consecutive inline overflow tiles. */
export function tiledPageGroups(plan: Plan): PlanPageTiles[] {
  const groups: PlanPageTiles[] = []
  for (let index = 0; index < plan.pages.length; index += 1) {
    const page = plan.pages[index] as TiledPlanPage | undefined
    if (!page) continue
    if (page.inlineTile === undefined || page.inlineTile === 0) groups.push({ sourceIndex: groups.length, tiles: [] })
    groups.at(-1)?.tiles.push({ index, page })
  }
  return groups
}

/** Maps a galley-coordinate anchor into its page window. */
export function windowAnchorTop(window: Plan['pages'][number]['windows'][number], top: number): number {
  return window.top + top - window.start
}
