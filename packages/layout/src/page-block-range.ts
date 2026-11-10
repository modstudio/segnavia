import type { Measurements, PaginateLine, PaginateWindow, PlanPage } from '@segnavia/format'

export function pageBlockRange(
  flows: readonly Measurements['flows'][number][],
  page: Pick<PlanPage, 'windows'>,
): { first?: PlanPage['start']; last?: PlanPage['start'] } {
  const lineInWindow = (line: PaginateLine, window: PaginateWindow): boolean => line.top >= window.start && line.bottom <= window.end
  const blockInWindow = (window: PaginateWindow, fromEnd: boolean): PlanPage['start'] => {
    const flow = flows.find((candidate) => candidate.id === window.flow)
    if (!flow || flow.kind === 'fixed') return undefined
    const blockIndexes = flow.blocks.map((_, index) => index)
    if (fromEnd) blockIndexes.reverse()
    for (const blockIndex of blockIndexes) {
      const block = flow.blocks[blockIndex]
      if (!block) continue
      const lineIndexes = block.lines.map((_, index) => index)
      if (fromEnd) lineIndexes.reverse()
      const line = lineIndexes.find((index) => block.lines[index] !== undefined && lineInWindow(block.lines[index], window))
      if (line !== undefined) return { flow: flow.id, block: blockIndex, line, ...(block.id === undefined ? {} : { id: block.id }) }
    }
    return undefined
  }
  const starts = page.windows.flatMap((window) => {
    const start = blockInWindow(window, false)
    return start === undefined ? [] : [start]
  })
  const ends = page.windows.flatMap((window) => {
    const end = blockInWindow(window, true)
    return end === undefined ? [] : [end]
  })
  const first = starts[0]
  const last = ends.at(-1)
  return { ...(first === undefined ? {} : { first }), ...(last === undefined ? {} : { last }) }
}
