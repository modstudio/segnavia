import type { OriginApproval, PageWidths } from '@segnavia/format'
import { BoardDocumentElement } from './board-document-element.ts'
import type { AssetPlacementsOptions as PlacementsOptions } from './board-policy.ts'
import type { MotifsOptions } from './motif-expansion.ts'
import type { FontsOptions } from './page-fonts.ts'
import { parsePageWidths, samePageWidths } from './page-widths.ts'

export interface BoardFrameInputs {
  motifs?: MotifsOptions
  fonts?: FontsOptions
  placements?: PlacementsOptions
  pageWidths?: PageWidths
  origins: readonly OriginApproval[]
}

export interface FrameInputsTarget {
  motifs: MotifsOptions | undefined
  fonts: FontsOptions | undefined
  placements: PlacementsOptions | undefined
  pageWidths: PageWidths | undefined
  origins: Iterable<OriginApproval>
}

export function applyFrameInputs(target: FrameInputsTarget, inputs: BoardFrameInputs): void {
  target.motifs = inputs.motifs
  target.fonts = inputs.fonts
  target.placements = inputs.placements
  target.pageWidths = inputs.pageWidths
  target.origins = inputs.origins
}

export abstract class BoardFrameInputsElement extends BoardDocumentElement {
  protected frameInputs: BoardFrameInputs = { origins: [] }

  set motifs(value: MotifsOptions | undefined) {
    this.frameInputs = { ...this.frameInputs, motifs: value }
    this.frameInputsChanged()
  }
  set placements(value: PlacementsOptions | undefined) {
    this.frameInputs = { ...this.frameInputs, placements: value }
    this.frameInputsChanged()
  }
  set pageWidths(value: PageWidths | undefined) {
    const pageWidths = parsePageWidths(value)
    if (samePageWidths(this.frameInputs.pageWidths, pageWidths)) return
    this.frameInputs = { ...this.frameInputs, pageWidths }
    this.frameInputsChanged()
  }
  set fonts(value: FontsOptions | undefined) {
    this.frameInputs = { ...this.frameInputs, fonts: value }
    this.frameInputsChanged()
  }
  get origins(): Iterable<OriginApproval> {
    return this.frameInputs.origins
  }
  set origins(value: Iterable<OriginApproval> | undefined) {
    this.frameInputs = { ...this.frameInputs, origins: value === undefined ? [] : [...value] }
    this.frameInputsChanged()
  }

  protected abstract frameInputsChanged(): void
}
