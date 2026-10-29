import { paginateColumns } from './paginate-columns.ts'
import type { PaginateBlock, PaginateUnit } from './paginate-types.ts'

export function paginateKeeps(
  placed: PaginateUnit[],
  next: PaginateUnit | undefined,
  textHeight: number,
  orphans: number,
  widows: number,
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

  function keepWithNext(block: PaginateBlock): boolean {
    return block.kind === 'heading' || Boolean(block.keepWithNext)
  }

  function keepTogether(block: PaginateBlock): boolean {
    const together = block.kind === 'figure' || block.kind === 'table' || Boolean(block.keepTogether)
    if (!together) return false
    return layoutHeight(block) <= textHeight
  }

  function orphansOf(block: PaginateBlock): number {
    return block.orphans ?? orphans
  }

  function widowsOf(block: PaginateBlock): number {
    return block.widows ?? widows
  }

  function rewindTogether(held: PaginateUnit[], last: PaginateUnit): PaginateUnit[] | undefined {
    if (!keepTogether(last.block) || countOf(held, last.block) >= last.block.lines.length) return undefined
    return kept(dropBlock(held, last.block))
  }

  function rewindOrphans(held: PaginateUnit[], last: PaginateUnit): PaginateUnit[] | undefined {
    const block = last.block
    if (block.kind === 'table') return undefined
    const heldCount = countOf(held, block)
    const starts = held.some((unit) => sameBlock(unit.block, block) && unit.index === 0)
    if (!starts || heldCount >= block.lines.length || heldCount >= orphansOf(block)) return undefined
    return kept(dropBlock(held, block))
  }

  function rewindWidows(held: PaginateUnit[], last: PaginateUnit): PaginateUnit[] | undefined {
    const block = last.block
    if (block.kind === 'table') return undefined
    const remaining = block.lines.length - last.index - 1
    const needWidows = widowsOf(block)
    if (remaining <= 0 || remaining >= needWidows) return undefined
    const need = needWidows - remaining
    return kept(countOf(held, block) - need <= 0 ? dropBlock(held, block) : held.slice(0, held.length - need))
  }

  function rewindHeading(held: PaginateUnit[], last: PaginateUnit, following: PaginateUnit | undefined): PaginateUnit[] | undefined {
    const other = following && !sameBlock(following.block, last.block)
    if (!keepWithNext(last.block) || countOf(held, last.block) !== last.block.lines.length || !other) return undefined
    return kept(dropBlock(held, last.block))
  }

  let result = placed
  for (let pass = 0; pass < 8; pass += 1) {
    const last = result[result.length - 1]
    if (!last) return result
    const following = placed[result.length] ?? next
    const nextResult = rewindTogether(result, last) ?? rewindOrphans(result, last) ?? rewindWidows(result, last) ?? rewindHeading(result, last, following)
    if (!nextResult) return result
    result = nextResult
  }
  return result
}
