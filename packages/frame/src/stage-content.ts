import { type Deck, type Folio, firstStrongDirection, type OriginApproval, type PixelSize, type PreflightProfile, type Slide } from '@segnavia/format'
import { frameDocument, frameSandbox, frameStyleSheets, newNonce, StyleSheetRefusedError } from './bridge.ts'
import type { DeckController, ResolvedContent } from './controller.ts'
import type { FrameTitle } from './frame-title.ts'
import { annotationFocusBox, fitImage, imageFrameStyle } from './image-fit.ts'
import { LAYOUT_FRAME_ATTRIBUTE, type LoadedLayoutScript, layoutsUsed, loadLayoutScripts } from './layout.ts'
import { type PreparedSlots, slotHtml } from './slot-render.ts'
import { annotationSvg } from './svg.ts'

const canvasLayouts = new WeakMap<HTMLElement, (size: PixelSize) => void>()

interface StageCanvasOptions {
  css: string
  csp: string
  origins?: Iterable<OriginApproval>
  frameTitle: FrameTitle
  loaded: () => void
  slots?: PreparedSlots
  bridge?: boolean
  folio: Folio
  failed?: (error: Error) => void
  preflight?: PreflightProfile
  layoutScripts?: readonly LoadedLayoutScript[]
}

function htmlFrameDocument(deck: Deck, html: string, options: StageCanvasOptions): string | undefined {
  try {
    return frameDocument(slotHtml(html, options.slots), {
      scripts: deck.scripts,
      nonce: newNonce(),
      dir: deck.dir,
      lang: deck.lang,
      fonts: deck.style?.fonts,
      sheets: frameStyleSheets(deck.style, deck.brand),
      css: options.css,
      csp: options.csp || undefined,
      origins: options.origins,
      reportHeight: false,
      bridge: options.bridge,
      preflight: options.preflight,
      layoutScripts: options.layoutScripts,
    })
  } catch (error) {
    if (!(error instanceof StyleSheetRefusedError) || !options.failed) throw error
    options.failed(error)
  }
}

function writeFrame(iframe: HTMLIFrameElement, srcdoc: string, loaded: () => void): void {
  iframe.addEventListener('load', loaded, { once: true })
  iframe.srcdoc = srcdoc
}

function refusalLayoutScript(html: string, reason: unknown): LoadedLayoutScript {
  const name = layoutsUsed(html)[0] ?? 'selected'
  const message = reason instanceof Error ? reason.message : String(reason)
  return { name, script: `throw new Error(${JSON.stringify(message)})`, priority: 0, order: 0, selects: '*' }
}

function writeHtmlFrame(iframe: HTMLIFrameElement, deck: Deck, html: string, options: StageCanvasOptions): boolean {
  if (layoutsUsed(html).length === 0) {
    const srcdoc = htmlFrameDocument(deck, html, { ...options, layoutScripts: [] })
    if (srcdoc !== undefined) writeFrame(iframe, srcdoc, options.loaded)
    return srcdoc !== undefined
  }
  if (htmlFrameDocument(deck, html, { ...options, layoutScripts: [] }) === undefined) return false
  iframe.setAttribute(LAYOUT_FRAME_ATTRIBUTE, '')
  void loadLayoutScripts(html).then(
    (layoutScripts) => {
      const srcdoc = htmlFrameDocument(deck, html, { ...options, layoutScripts })
      if (srcdoc !== undefined) writeFrame(iframe, srcdoc, options.loaded)
    },
    (error) => {
      const failure = error instanceof Error ? error : new Error(String(error))
      options.failed?.(failure)
      const srcdoc = htmlFrameDocument(deck, html, { ...options, layoutScripts: [refusalLayoutScript(html, failure)] })
      if (srcdoc !== undefined) writeFrame(iframe, srcdoc, options.loaded)
    },
  )
  return true
}

export function layoutStageCanvas(canvas: HTMLElement, size: PixelSize) {
  canvas.style.inlineSize = `${size.width}px`
  canvas.style.blockSize = `${size.height}px`
  canvas.style.marginBlockStart = `${-size.height / 2}px`
  canvas.style.marginInlineStart = `${-size.width / 2}px`
  canvasLayouts.get(canvas)?.(size)
}

export function stageCanvas(controller: DeckController, deck: Deck, slide: Slide, content: ResolvedContent, options: StageCanvasOptions): HTMLElement {
  const canvas = document.createElement('div')
  canvas.className = 'segnavia-stage__canvas'
  canvas.dataset.slideId = slide.id
  canvas.style.overflow = 'hidden'
  if (content.kind === 'html' || content.kind === 'url') {
    const iframe = document.createElement('iframe')
    iframe.className = 'segnavia-stage__frame'
    // A URL slide's host-served document is outside the frame policy that blocks form submission.
    iframe.setAttribute('sandbox', options.bridge === false ? '' : frameSandbox(content.kind === 'url' ? 'refuse' : deck.scripts))
    iframe.title = options.frameTitle(deck.title, options.folio.number)
    if (content.kind === 'html') {
      if (!writeHtmlFrame(iframe, deck, content.html, options)) {
        layoutStageCanvas(canvas, deck.size)
        return canvas
      }
    } else {
      iframe.addEventListener('load', options.loaded, { once: true })
      iframe.src = controller.url(content.src)
    }
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
    image.addEventListener('error', () => options.failed?.(new Error(`The image for slide "${slide.id}" could not be loaded.`)), { once: true })
    image.style.display = 'block'
    let imageSize: PixelSize | undefined = content.kind === 'image' ? undefined : content.shot.size
    let slideSize: PixelSize = deck.size
    const position = () => {
      if (!imageSize) return
      const focus = content.kind === 'shot' ? annotationFocusBox(imageSize, content.shot.annotations) : undefined
      const placement = fitImage(slideSize, imageSize, content.fit ?? deck.fit, focus, content.frame ?? deck.frame)
      layer.style.inlineSize = `${imageSize.width}px`
      layer.style.blockSize = `${imageSize.height}px`
      layer.style.transform = `translate(${placement.x}px, ${placement.y}px) scale(${placement.scale})`
      image.style.inlineSize = `${imageSize.width}px`
      image.style.blockSize = `${imageSize.height}px`
      Object.assign(image.style, imageFrameStyle(placement, slideSize))
    }
    canvasLayouts.set(canvas, (size) => {
      slideSize = size
      position()
    })
    if (content.kind === 'image') {
      image.addEventListener(
        'load',
        () => {
          imageSize = { width: image.naturalWidth, height: image.naturalHeight }
          position()
          options.loaded()
        },
        { once: true },
      )
    } else {
      position()
      image.addEventListener('load', options.loaded, { once: true })
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
  layoutStageCanvas(canvas, deck.size)
  return canvas
}
