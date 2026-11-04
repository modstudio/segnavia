import type { Position } from './watched.ts'

export type SeekPolicy = 'free' | 'furthest'

export interface NavigationRequest {
  kind: 'position' | 'slide'
  to: Position
}

export function slideRequest(index: number): NavigationRequest {
  return { kind: 'slide', to: { index, ms: 0 } }
}

function comparePosition(left: Position, right: Position): number {
  return left.index - right.index || left.ms - right.ms
}

export function limitNavigation(policy: SeekPolicy, reach: Position, request: NavigationRequest): Position | null {
  if (policy === 'free' || comparePosition(request.to, reach) <= 0) return request.to
  return request.kind === 'position' ? reach : null
}
