import type { DeckAction } from './keys.ts'
import { keyAction } from './keys.ts'

interface KeyController {
  readonly keys: 'stage' | 'page'
  readonly state: { direction: 'ltr' | 'rtl'; muted: boolean; captionsVisible: boolean }
  next(): Promise<void>
  previous(): Promise<void>
  toggle(): Promise<void> | void
  setMuted(muted: boolean): void
  setCaptionsVisible(visible: boolean): void
}

export function handleControllerKey(controller: KeyController, key: string): DeckAction | null {
  if (controller.keys === 'page' && key === ' ') return null
  const action = keyAction(key, controller.state.direction)
  if (action === 'next') void controller.next().catch(() => {})
  else if (action === 'previous') void controller.previous().catch(() => {})
  else if (action === 'toggle') void Promise.resolve(controller.toggle()).catch(() => {})
  else if (action === 'mute') controller.setMuted(!controller.state.muted)
  else if (action === 'captions') controller.setCaptionsVisible(!controller.state.captionsVisible)
  return action
}
