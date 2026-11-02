import type { BoardItem, PageWidths } from '@segnavia/format'
import { boardImage, boardPlaceholder, boardShield, liveBoardItem } from './board-live.ts'
import type { BoardTier, CheckedResolvedBoardItem, AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import { mountDesignedCover } from './designed-cover.ts'
import { coverPresentation } from './designed-cover-policy.ts'
import type { MotifsOptions } from './motif-expansion.ts'
import type { FontsOptions } from './page-fonts.ts'
import { parsePageWidths, samePageWidths } from './page-widths.ts'

export class BoardPainter {
  fonts?: FontsOptions
  pageWidths?: PageWidths
  private readonly tiers = new Map<string, BoardTier>()
  private readonly painted = new Map<string, CheckedResolvedBoardItem | undefined>()
  private readonly motifOptions = new Map<string, MotifsOptions | undefined>()
  private readonly fontOptions = new Map<string, FontsOptions | undefined>()
  private readonly placementOptions = new Map<string, PlacementsOptions | undefined>()
  private readonly widthOptions = new Map<string, PageWidths | undefined>()
  private readonly disposals = new Map<string, () => void>()

  setPageWidths(value: PageWidths | undefined): boolean {
    const parsed = parsePageWidths(value)
    if (samePageWidths(this.pageWidths, parsed)) return false
    this.pageWidths = parsed
    return true
  }

  paint(
    node: HTMLElement,
    item: BoardItem,
    resolved: CheckedResolvedBoardItem | undefined,
    tier: BoardTier,
    failed: (error: unknown) => void,
    motifs?: MotifsOptions,
    fonts?: FontsOptions,
    placements?: PlacementsOptions,
  ) {
    const pageWidths = this.pageWidths
    if (
      this.tiers.get(item.id) === tier &&
      this.painted.get(item.id) === resolved &&
      this.motifOptions.get(item.id) === motifs &&
      this.fontOptions.get(item.id) === fonts &&
      this.placementOptions.get(item.id) === placements &&
      this.widthOptions.get(item.id) === pageWidths &&
      node.childElementCount > 0
    )
      return
    this.dispose(item.id)
    node.replaceChildren()
    this.tiers.set(item.id, tier)
    this.painted.set(item.id, resolved)
    this.motifOptions.set(item.id, motifs)
    this.fontOptions.set(item.id, fonts)
    this.placementOptions.set(item.id, placements)
    this.widthOptions.set(item.id, pageWidths)
    try {
      const content = resolved ? this.content(item.id, resolved, tier, failed, motifs, fonts, placements, pageWidths) : boardPlaceholder()
      node.append(content, boardShield())
    } catch (error) {
      failed(error)
    }
  }

  remove(id: string) {
    this.tiers.delete(id)
    this.painted.delete(id)
    this.motifOptions.delete(id)
    this.fontOptions.delete(id)
    this.placementOptions.delete(id)
    this.widthOptions.delete(id)
    this.dispose(id)
  }

  dispose(id: string) {
    this.disposals.get(id)?.()
    this.disposals.delete(id)
  }

  private content(
    id: string,
    resolved: CheckedResolvedBoardItem,
    tier: BoardTier,
    failed: (error: unknown) => void,
    motifs?: MotifsOptions,
    fonts?: FontsOptions,
    placements?: PlacementsOptions,
    pageWidths?: PageWidths,
  ): HTMLElement {
    if (tier === 'cover') {
      const presentation = coverPresentation(resolved.designedCover)
      if (presentation.kind !== 'fallback') {
        const mounted = mountDesignedCover(presentation, failed, motifs, fonts, placements)
        this.disposals.set(id, mounted.dispose)
        return mounted.element
      }
      if (resolved.kind === 'image' || resolved.kind === 'shot') return boardImage(resolved.src)
      return resolved.cover ? boardImage(resolved.cover) : boardPlaceholder()
    }
    if (resolved.kind === 'image' || resolved.kind === 'shot') return boardImage(resolved.src)
    const live = liveBoardItem(resolved, failed, motifs, fonts, placements, pageWidths)
    this.disposals.set(id, live.dispose)
    return live.element
  }
}
