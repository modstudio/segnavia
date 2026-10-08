import { MESSAGE } from './bridge.ts'

export type PrintImage = EventTarget & { readonly complete: boolean; decode?: () => Promise<unknown> }

export function printDocumentSettled(
  messages: EventTarget,
  frameWindows: readonly EventTarget[],
  images: readonly PrintImage[],
  deadline: Promise<unknown>,
): Promise<void> {
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
      resolve()
    }
    const finishIfSettled = () => {
      if (waitingFrames.size === 0 && waitingImages.size === 0) finish()
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
