import type { BoardItem } from '@segnavia/format'
import type { BoardFrameInputs } from './board-frame-inputs.ts'
import { boardImage, boardPlaceholder, boardShield, liveBoardItem } from './board-live.ts'
import type { BoardTier, CheckedResolvedBoardItem } from './board-policy.ts'
import { mountDesignedCover } from './designed-cover.ts'
import { coverPresentation } from './designed-cover-policy.ts'

export class BoardPainter {
  private readonly tiers = new Map<string, BoardTier>()
  private readonly painted = new Map<string, CheckedResolvedBoardItem | undefined>()
  private readonly frameInputs = new Map<string, BoardFrameInputs>()
  private readonly disposals = new Map<string, () => void>()

  paint(
    node: HTMLElement,
    item: BoardItem,
    resolved: CheckedResolvedBoardItem | undefined,
    tier: BoardTier,
    failed: (error: unknown) => void,
    inputs: BoardFrameInputs,
  ) {
    if (this.tiers.get(item.id) === tier && this.painted.get(item.id) === resolved && this.frameInputs.get(item.id) === inputs && node.childElementCount > 0)
      return
    this.dispose(item.id)
    node.replaceChildren()
    this.tiers.set(item.id, tier)
    this.painted.set(item.id, resolved)
    this.frameInputs.set(item.id, inputs)
    try {
      const content = resolved ? this.content(item.id, resolved, tier, failed, inputs) : boardPlaceholder()
      node.append(content, boardShield())
    } catch (error) {
      failed(error)
    }
  }

  remove(id: string) {
    this.tiers.delete(id)
    this.painted.delete(id)
    this.frameInputs.delete(id)
    this.dispose(id)
  }

  dispose(id: string) {
    this.disposals.get(id)?.()
    this.disposals.delete(id)
  }

  private content(id: string, resolved: CheckedResolvedBoardItem, tier: BoardTier, failed: (error: unknown) => void, inputs: BoardFrameInputs): HTMLElement {
    if (tier === 'cover') {
      const presentation = coverPresentation(resolved.designedCover)
      if (presentation.kind !== 'fallback') {
        const mounted = mountDesignedCover(presentation, failed, inputs)
        this.disposals.set(id, mounted.dispose)
        return mounted.element
      }
      if (resolved.kind === 'image' || resolved.kind === 'shot') return boardImage(resolved.src)
      return resolved.cover ? boardImage(resolved.cover) : boardPlaceholder()
    }
    if (resolved.kind === 'image' || resolved.kind === 'shot') return boardImage(resolved.src)
    const live = liveBoardItem(resolved, failed, inputs)
    this.disposals.set(id, live.dispose)
    return live.element
  }
}
