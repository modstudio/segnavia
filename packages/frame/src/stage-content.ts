import { type Deck, firstStrongDirection, type Slide } from '@segnavia/format'
import { frameDocument, newNonce } from './bridge.ts'
import type { DeckController, ResolvedContent } from './controller.ts'
import { annotationSvg } from './svg.ts'

export type FrameTitle = (deckTitle: string, slideNumber: number) => string

export function stageCanvas(
  controller: DeckController,
  deck: Deck,
  slide: Slide,
  index: number,
  content: ResolvedContent,
  css: string,
  csp: string,
  frameTitle: FrameTitle,
): HTMLElement {
  const { width, height } = deck.size
  const canvas = document.createElement('div')
  canvas.className = 'segnavia-stage__canvas'
  canvas.dataset.slideId = slide.id
  canvas.style.inlineSize = `${width}px`
  canvas.style.blockSize = `${height}px`
  canvas.style.marginBlockStart = `${-height / 2}px`
  canvas.style.marginInlineStart = `${-width / 2}px`
  if (content.kind === 'html' || content.kind === 'url') {
    const iframe = document.createElement('iframe')
    iframe.className = 'segnavia-stage__frame'
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.title = frameTitle(deck.title, index + 1)
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
    const image = document.createElement('img')
    image.className = 'segnavia-stage__image'
    image.src = controller.url(content.src)
    image.alt = content.kind === 'image' ? content.alt : content.shot.title
    image.dir = firstStrongDirection(image.alt) ?? 'auto'
    canvas.append(image)
    if (content.kind === 'shot') {
      const layer = document.createElement('div')
      layer.className = 'segnavia-stage__annotations'
      layer.innerHTML = annotationSvg(content.shot.size, content.shot.annotations, 'currentColor')
      canvas.append(layer)
    }
  }
  return canvas
}
