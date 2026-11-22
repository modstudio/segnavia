import { type BoardItem, soundCover } from '@segnavia/format'
import type { BoardFrameInputs } from './board-frame-inputs.ts'
import { boardImage, boardPlaceholder, boardShield, liveBoardItem, unavailablePlaceholder } from './board-live.ts'
import type { BoardTier, CheckedResolvedBoardItem } from './board-policy.ts'
import type { BoardResolutionOutcome } from './board-resolutions.ts'
import { mountDesignedCover } from './designed-cover.ts'
import { coverPresentation } from './designed-cover-policy.ts'
import { soundPlayDetail } from './sound-play.ts'

export class BoardPainter {
  private readonly tiers = new Map<string, BoardTier>()
  private readonly painted = new Map<string, BoardResolutionOutcome>()
  private readonly frameInputs = new Map<string, BoardFrameInputs>()
  private readonly disposals = new Map<string, () => void>()

  paint(node: HTMLElement, item: BoardItem, outcome: BoardResolutionOutcome, tier: BoardTier, failed: (error: unknown) => void, inputs: BoardFrameInputs) {
    if (
      this.tiers.get(item.id) === tier &&
      sameOutcome(this.painted.get(item.id), outcome) &&
      this.frameInputs.get(item.id) === inputs &&
      node.childElementCount > 0
    )
      return
    this.dispose(item.id)
    node.replaceChildren()
    this.tiers.set(item.id, tier)
    this.painted.set(item.id, outcome)
    this.frameInputs.set(item.id, inputs)
    try {
      node.removeAttribute('data-board-item-state')
      const content =
        outcome.status === 'resolved'
          ? this.content(item.id, outcome.value, tier, failed, inputs)
          : outcome.status === 'unavailable'
            ? unavailablePlaceholder(outcome.value.label, outcome.value.kind)
            : boardPlaceholder()
      if (outcome.status === 'unavailable') node.dataset.boardItemState = outcome.value.state
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
      if (resolved.kind === 'sound') {
        const mounted = mountDesignedCover({ kind: 'live', cover: soundCover(resolved.sound) }, failed, inputs)
        this.disposals.set(id, mounted.dispose)
        return mounted.element
      }
      if (resolved.kind === 'image' || resolved.kind === 'shot') return boardImage(resolved.src)
      return resolved.cover ? boardImage(resolved.cover) : boardPlaceholder()
    }
    if (resolved.kind === 'image' || resolved.kind === 'shot') return boardImage(resolved.src)
    if (resolved.kind === 'sound') {
      const button = document.createElement('button')
      button.type = 'button'
      const mounted = mountDesignedCover({ kind: 'live', cover: soundCover(resolved.sound) }, failed, inputs)
      mounted.element.style.pointerEvents = 'none'
      button.append(mounted.element)
      button.addEventListener('click', () => {
        button.dispatchEvent(
          new CustomEvent('segnavia-sound-play', {
            detail: soundPlayDetail(resolved.sound, resolved.src, id),
            bubbles: true,
            composed: true,
            cancelable: true,
          }),
        )
      })
      this.disposals.set(id, mounted.dispose)
      return button
    }
    const live = liveBoardItem(resolved, failed, inputs)
    this.disposals.set(id, live.dispose)
    return live.element
  }
}

function sameOutcome(previous: BoardResolutionOutcome | undefined, next: BoardResolutionOutcome): boolean {
  if (!previous || previous.status !== next.status) return false
  if (previous.status === 'resolved' && next.status === 'resolved') return previous.value === next.value
  if (previous.status === 'unavailable' && next.status === 'unavailable') return previous.value === next.value
  return true
}
