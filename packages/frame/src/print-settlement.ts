import { MESSAGE, type SlotFitState, slotFitMessageData } from './bridge.ts'

export type PrintImage = EventTarget & { readonly complete: boolean; decode?: () => Promise<unknown> }

/** True while some filled frame that marked a refuse slot has not yet posted its fit report. */
export function slotFitStillPending(marked: ReadonlyMap<string, number>, measured: ReadonlyMap<string, number>, refuseKeys: ReadonlySet<string>): boolean {
  for (const [key, count] of marked) {
    if (!refuseKeys.has(key)) continue
    if ((measured.get(key) ?? 0) < count) return true
  }
  return false
}

export function printDocumentSettled(
  messages: EventTarget,
  frameWindows: readonly EventTarget[],
  images: readonly PrintImage[],
  deadline: Promise<unknown>,
  onSlotFit?: (slots: Record<string, SlotFitState>) => void,
  slotFitPending?: () => boolean,
): Promise<boolean> {
  return new Promise((resolve) => {
    const waitingFrames = new Set(frameWindows)
    const waitingImages = new Set(images.filter((image) => typeof image.decode === 'function' || !image.complete))
    let finished = false

    const finish = () => {
      if (finished) return
      finished = true
      messages.removeEventListener('message', onMessage)
      for (const image of waitingImages) {
        image.removeEventListener('load', onImage)
        image.removeEventListener('error', onImage)
      }
      resolve(waitingFrames.size === 0)
    }
    const finishIfSettled = () => {
      // Ready is not enough while a filled frame still owes its fit report; the deadline still releases.
      if (waitingFrames.size === 0 && waitingImages.size === 0 && !slotFitPending?.()) finish()
    }
    const onImage = (event: Event) => {
      const image = event.currentTarget as PrintImage
      image.removeEventListener('load', onImage)
      image.removeEventListener('error', onImage)
      waitingImages.delete(image)
      finishIfSettled()
    }
    const onMessage = (event: Event) => {
      const message = event as MessageEvent
      if (!frameWindows.includes(message.source as unknown as EventTarget)) return
      const fit = slotFitMessageData(message.data)
      if (fit) {
        onSlotFit?.(fit.slots)
        finishIfSettled()
        return
      }
      if ((message.data as { type?: unknown })?.type !== MESSAGE.ready) return
      waitingFrames.delete(message.source as unknown as EventTarget)
      finishIfSettled()
    }

    messages.addEventListener('message', onMessage)
    for (const image of waitingImages) {
      if (image.decode) {
        void image.decode().then(
          () => onDecoded(image),
          () => onDecoded(image),
        )
      } else {
        image.addEventListener('load', onImage)
        image.addEventListener('error', onImage)
      }
    }
    void deadline.then(finish, finish)
    finishIfSettled()

    function onDecoded(image: PrintImage) {
      waitingImages.delete(image)
      finishIfSettled()
    }
  })
}
