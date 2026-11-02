import type { MountedElement } from './mounted-element.ts'

export function coverImage(
  src: string,
  failed?: (error: unknown) => void,
  createImage: () => HTMLImageElement = () => document.createElement('img'),
): MountedElement {
  const image = createImage()
  image.src = src
  image.alt = ''
  image.part.add('cover')
  const onError = (event: Event) => {
    const error = event as ErrorEvent
    failed?.(error.error ?? error.message)
  }
  if (failed) image.addEventListener('error', onError)
  return {
    element: image,
    dispose() {
      if (failed) image.removeEventListener('error', onError)
    },
  }
}
