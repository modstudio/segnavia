import { MESSAGE, messageFrom } from './bridge.ts'
import type { PreparedSlots } from './slot-render.ts'

/** Merges a validated fit message only when its source is one of the owner's current frames. */
export function mergeOwnedSlotFit(event: MessageEvent, frames: Iterable<HTMLIFrameElement>, slots: PreparedSlots): boolean {
  for (const frame of frames) {
    const message = messageFrom(event, frame)
    if (message?.type !== MESSAGE.slotFit || !message.slots) continue
    slots.mergeFit(message.slots)
    return true
  }
  return false
}
