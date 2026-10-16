import { type Deck, firstStrongDirection, type Slide } from '@segnavia/format'
import { frameDocument, newNonce } from './bridge.ts'
import type { DeckController, ResolvedContent } from './controller.ts'
import type { FrameTitle } from './frame-title.ts'
import { annotationFocusBox, fitImage } from './image-fit.ts'
import { annotationSvg } from './svg.ts'

export function stageCanvas(
  controller: DeckController,
  deck: Deck,
  slide: Slide,
  index: number,
  content: ResolvedContent,
  css: string,
  csp: string,
  frameTitle: FrameTitle,
  loaded: () => void,
): HTMLElement {
  const { width, height } = deck.size
  const canvas = document.createElement('div')
  canvas.className = 'segnavia-stage__canvas'
  canvas.dataset.slideId = slide.id
  canvas.style.inlineSize = `${width}px`
  canvas.style.blockSize = `${height}px`
  canvas.style.marginBlockStart = `${-height / 2}px`
  canvas.style.marginInlineStart = `${-width / 2}px`
  canvas.style.overflow = 'hidden'
  if (content.kind === 'html' || content.kind === 'url') {
    const iframe = document.createElement('iframe')
    iframe.className = 'segnavia-stage__frame'
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.title = frameTitle(deck.title, index + 1)
    iframe.addEventListener('load', loaded, { once: true })
    if (content.kind === 'html') {
      iframe.srcdoc = frameDocument(content.html, {
        scripts: deck.scripts,
        nonce: newNonce(),
        dir: deck.dir,
        lang: deck.lang,
        css,
        csp: csp || undefined,
        reportHeight: false,
      })
    } else iframe.src = controller.url(content.src)
    canvas.append(iframe)
  } else {
    const layer = document.createElement('div')
    layer.className = 'segnavia-stage__media'
    layer.style.position = 'absolute'
    layer.style.inset = '0 auto auto 0'
    layer.style.transformOrigin = '0 0'
    const image = document.createElement('img')
    image.className = 'segnavia-stage__image'
    image.alt = content.kind === 'image' ? content.alt : content.shot.title
    image.dir = firstStrongDirection(image.alt) ?? 'auto'
    image.style.display = 'block'
    const position = (imageSize: { width: number; height: number }) => {
      const focus = content.kind === 'shot' ? annotationFocusBox(imageSize, content.shot.annotations) : undefined
      const placement = fitImage(deck.size, imageSize, content.fit ?? deck.fit, focus)
      layer.style.inlineSize = `${imageSize.width}px`
      layer.style.blockSize = `${imageSize.height}px`
      layer.style.transform = `translate(${placement.x}px, ${placement.y}px) scale(${placement.scale})`
      image.style.inlineSize = `${imageSize.width}px`
      image.style.blockSize = `${imageSize.height}px`
    }
    if (content.kind === 'image') {
      image.addEventListener(
        'load',
        () => {
          position({ width: image.naturalWidth, height: image.naturalHeight })
          loaded()
        },
        { once: true },
      )
    } else {
      position(content.shot.size)
      image.addEventListener('load', loaded, { once: true })
    }
    image.src = controller.url(content.src)
    layer.append(image)
    if (content.kind === 'shot') {
      const annotations = document.createElement('div')
      annotations.className = 'segnavia-stage__annotations'
      annotations.style.position = 'absolute'
      annotations.style.inset = '0'
      annotations.style.inlineSize = `${content.shot.size.width}px`
      annotations.style.blockSize = `${content.shot.size.height}px`
      annotations.innerHTML = annotationSvg(content.shot.size, content.shot.annotations, 'currentColor')
      layer.append(annotations)
    }
    canvas.append(layer)
  }
  return canvas
}
