import type { DeckController } from './controller.ts'
import { isEditableLetterShortcut, isEditableTarget, keyAction } from './keys.ts'

export function handleControllerPageKey(controller: DeckController, event: KeyboardEvent) {
  if (event.defaultPrevented) return
  const target = event.target
  const action = keyAction(event.key, controller.state.direction)
  if (isEditableLetterShortcut(event.key, target)) return
  if ((action === 'next' || action === 'previous') && isEditableTarget(target)) return
  if (controller.key(event.key)) event.preventDefault()
}
