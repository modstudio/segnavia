import { paginateColumns } from './paginate-columns.ts'
import type { PaginateBlock, PaginateUnit } from './paginate-types.ts'

export function paginateKeeps(
  placed: PaginateUnit[],
  next: PaginateUnit | undefined,
  textHeight: number,
  _orphans: number,
  _widows: number,
  allowEmpty?: boolean,
): PaginateUnit[] {
  function sameBlock(left: PaginateBlock, right: PaginateBlock): boolean {
    return left.position.chapter === right.position.chapter && left.position.block === right.position.block
  }

  function countOf(held: PaginateUnit[], block: PaginateBlock): number {
    let count = 0
    for (const unit of held) if (sameBlock(unit.block, block)) count += 1
    return count
  }

  function dropBlock(held: PaginateUnit[], block: PaginateBlock): PaginateUnit[] {
    return held.filter((unit) => !sameBlock(unit.block, block))
  }

  function kept(dropped: PaginateUnit[]): PaginateUnit[] | undefined {
    if (dropped.length > 0) return dropped
    return allowEmpty ? dropped : undefined
  }

  function layoutHeight(block: PaginateBlock): number {
    const units: PaginateUnit[] = []
    for (const [index, line] of block.lines.entries()) {
      units.push({ flowId: '', block, index, top: line.top, bottom: line.bottom, refs: [] })
    }
    return paginateColumns(units).height
  }

  function keepTogether(block: PaginateBlock): boolean {
    if (!block.keepTogether) return false
    return layoutHeight(block) <= textHeight
  }

  function runHeight(block: PaginateBlock, start: number, end: number): number {
    const held = { ...block, lines: block.lines.slice(start, end) }
    return layoutHeight(held)
  }

  function fittingRun(block: PaginateBlock, index: number): { start: number; end: number } | undefined {
    return block.keepRuns
      ?.filter((run) => run.start <= index && index < run.end && runHeight(block, run.start, run.end) <= textHeight)
      .sort((left, right) => right.end - right.start - (left.end - left.start))[0]
  }

  function rewindTogether(held: PaginateUnit[], last: PaginateUnit): PaginateUnit[] | undefined {
    if (!keepTogether(last.block) || countOf(held, last.block) >= last.block.lines.length) return undefined
    return kept(dropBlock(held, last.block))
  }

  function rewindOrphans(held: PaginateUnit[], last: PaginateUnit): PaginateUnit[] | undefined {
    const block = last.block
    if (block.orphans === undefined) return undefined
    const heldCount = countOf(held, block)
    const starts = held.some((unit) => sameBlock(unit.block, block) && unit.index === 0)
    if (!starts || heldCount >= block.lines.length || heldCount >= block.orphans) return undefined
    return kept(dropBlock(held, block))
  }

  function rewindWidows(held: PaginateUnit[], last: PaginateUnit): PaginateUnit[] | undefined {
    const block = last.block
    if (block.widows === undefined) return undefined
    const remaining = block.lines.length - last.index - 1
    const needWidows = block.widows
    if (remaining <= 0 || remaining >= needWidows) return undefined
    const need = needWidows - remaining
    return kept(countOf(held, block) - need <= 0 ? dropBlock(held, block) : held.slice(0, held.length - need))
  }

  function rewindRun(held: PaginateUnit[], last: PaginateUnit): PaginateUnit[] | undefined {
    const run = fittingRun(last.block, last.index)
    if (!run) return undefined
    const heldCount = held.filter((unit) => sameBlock(unit.block, last.block) && unit.index >= run.start && unit.index < run.end).length
    if (heldCount >= run.end - run.start) return undefined
    return kept(held.filter((unit) => !sameBlock(unit.block, last.block) || unit.index < run.start || unit.index >= run.end))
  }

  function rewindHeading(held: PaginateUnit[], last: PaginateUnit, following: PaginateUnit | undefined): PaginateUnit[] | undefined {
    const other = following && !sameBlock(following.block, last.block)
    if (!last.block.keepWithNext || countOf(held, last.block) !== last.block.lines.length || !other) return undefined
    return kept(dropBlock(held, last.block))
  }

  let result = placed
  for (let pass = 0; pass < 8; pass += 1) {
    const last = result[result.length - 1]
    if (!last) return result
    const following = placed[result.length] ?? next
    const nextResult =
      rewindTogether(result, last) ??
      rewindRun(result, last) ??
      rewindOrphans(result, last) ??
      rewindWidows(result, last) ??
      rewindHeading(result, last, following)
    if (!nextResult) return result
    result = nextResult
  }
  return result
}
