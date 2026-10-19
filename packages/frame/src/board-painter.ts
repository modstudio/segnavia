import type { BoardItem } from '@segnavia/format'
import { boardImage, boardPlaceholder, boardShield, liveBoardItem } from './board-live.ts'
import type { BoardTier, ResolvedBoardItem } from './board-policy.ts'

export class BoardPainter {
  private readonly tiers = new Map<string, BoardTier>()
  private readonly painted = new Map<string, ResolvedBoardItem | undefined>()
  private readonly disposals = new Map<string, () => void>()

  paint(node: HTMLElement, item: BoardItem, resolved: ResolvedBoardItem | undefined, tier: BoardTier, failed: (error: unknown) => void) {
    if (this.tiers.get(item.id) === tier && this.painted.get(item.id) === resolved && node.childElementCount > 0) return
    this.dispose(item.id)
    node.replaceChildren()
    this.tiers.set(item.id, tier)
    this.painted.set(item.id, resolved)
    try {
      const content = resolved ? this.content(item.id, resolved, tier, failed) : boardPlaceholder()
      node.append(content, boardShield())
    } catch (error) {
      failed(error)
    }
  }

  remove(id: string) {
    this.tiers.delete(id)
    this.painted.delete(id)
    this.dispose(id)
  }

  dispose(id: string) {
    this.disposals.get(id)?.()
    this.disposals.delete(id)
  }

  private content(id: string, resolved: ResolvedBoardItem, tier: BoardTier, failed: (error: unknown) => void): HTMLElement {
    if (resolved.kind === 'image' || resolved.kind === 'shot') return boardImage(resolved.src)
    if (tier === 'cover') return resolved.cover ? boardImage(resolved.cover) : boardPlaceholder()
    const live = liveBoardItem(resolved, failed)
    this.disposals.set(id, live.dispose)
    return live.element
  }
}
