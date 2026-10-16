export type PlayerFit = 'width' | 'height' | 'contain'
export type PlayerControls = 'below' | 'overlay'

export function playerFit(value: string | null): PlayerFit {
  return value === 'width' || value === 'height' ? value : 'contain'
}

export function playerControls(value: string | null): PlayerControls {
  return value === 'overlay' ? 'overlay' : 'below'
}

export interface ContainSizeInput {
  availableWidth: number
  availableHeight: number
  chromeHeight: number
  reserve: number
  ratio: number
}

export function containSlideSize(input: ContainSizeInput): { width: number; height: number } {
  const widthLimitedHeight = input.availableWidth / input.ratio
  const heightLimitedHeight = Math.max(240, input.availableHeight - input.chromeHeight - input.reserve)
  const height = Math.min(widthLimitedHeight, heightLimitedHeight)
  return { width: height * input.ratio, height }
}
