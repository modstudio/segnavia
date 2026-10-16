import type { DeckController } from './controller.ts'
import { isEditableLetterShortcut } from './keys.ts'

export function handlePlayerKey(controller: DeckController, stage: unknown, event: KeyboardEvent): boolean {
  if (event.defaultPrevented) return false
  const target = event.composedPath()[0]
  if (target === stage) return false
  if (isEditableLetterShortcut(event.key, target)) return false
  if ((event.key === ' ' || event.key === 'Enter') && target instanceof HTMLButtonElement) return false
  if (!controller.key(event.key)) return false
  event.preventDefault()
  return true
}
