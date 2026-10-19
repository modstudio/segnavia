export type PlayerFit = 'width' | 'height' | 'contain'
export type PlayerControls = 'below' | 'overlay'

// Shared with the player's compact container query, so measure and CSS cannot disagree.
export const COMPACT_PLAYER_WIDTH = 560

export function playerFit(value: string | null): PlayerFit {
  return value === 'width' || value === 'height' ? value : 'contain'
}

export function playerControls(value: string | null): PlayerControls {
  return value === 'overlay' ? 'overlay' : 'below'
}

export interface CompactBarParts {
  track: number
  start: number
  center: number
  endControls: number
  actions: number
}

// Flattened compact chrome: track + the tallest transport cell + host actions.
export function compactBarHeight(parts: CompactBarParts): number {
  return parts.track + Math.max(parts.start, parts.center, parts.endControls) + parts.actions
}

export interface ContainSizeInput {
  availableWidth: number
  availableHeight: number
  chromeHeight: number
  reserve: number
  ratio: number
}

interface MeasureState {
  deck: { size: { width: number; height: number } } | null
  presenting: boolean
}

export class PlayerMeasureChanges {
  private deck: MeasureState['deck'] = null
  private width = 0
  private height = 0
  private presenting = false

  update(state: MeasureState): boolean {
    const changed =
      state.deck !== this.deck || state.deck?.size.width !== this.width || state.deck?.size.height !== this.height || state.presenting !== this.presenting
    this.deck = state.deck
    this.width = state.deck?.size.width ?? 0
    this.height = state.deck?.size.height ?? 0
    this.presenting = state.presenting
    return changed
  }
}

export function containSlideSize(input: ContainSizeInput): { width: number; height: number } {
  const widthLimitedHeight = input.availableWidth / input.ratio
  const heightLimitedHeight = Math.max(240, input.availableHeight - input.chromeHeight - input.reserve)
  const height = Math.min(widthLimitedHeight, heightLimitedHeight)
  return { width: height * input.ratio, height }
}
