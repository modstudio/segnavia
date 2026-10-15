import type { DeckController } from './controller.ts'
import { isEditableLetterShortcut } from './keys.ts'

export function handlePlayerKey(controller: DeckController, stage: unknown, event: KeyboardEvent): void {
  const target = event.composedPath()[0]
  if (target === stage) return
  if (isEditableLetterShortcut(event.key, target)) return
  if ((event.key === ' ' || event.key === 'Enter') && target instanceof HTMLButtonElement) return
  if (controller.key(event.key)) event.preventDefault()
}
