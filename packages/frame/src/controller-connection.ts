import type { DeckController } from './controller.ts'

export function resumeController(controller: DeckController) {
  controller.connectWindow()
}

export function suspendController(controller: DeckController) {
  controller.stopPresenting()
  controller.pause()
  controller.disconnectWindow()
}
