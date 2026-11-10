import * as bookElement from './book-element-support.ts'
import type { BookLayout } from './book-presentation.ts'
import { dispatchComposeProgress, dispatchPreflight, MESSAGE } from './bridge.ts'
import type { FrameMessage } from './bridge-message.ts'

export function dispatchBookFrameReport(
  target: EventTarget,
  message: FrameMessage,
  frame: HTMLIFrameElement,
  layout: BookLayout | undefined,
  currentGeneration: string,
): boolean {
  const generation = frame.dataset.segnaviaBookGeneration
  if (bookElement.handleBookFontFailures(target, message, generation, currentGeneration)) return true
  if (message.type === MESSAGE.composeProgress) {
    if (layout === 'pages' && generation === currentGeneration) dispatchComposeProgress(target, message)
    return true
  }
  if (layout === 'pages' && generation === currentGeneration && dispatchPreflight(target, message)) return true
  return message.type === MESSAGE.composeFailure && generation !== currentGeneration
}
