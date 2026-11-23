import type { Imposed, Imposition } from '@segnavia/format'
import type { HtmlPage } from '@segnavia/html'
import { defineElementPropertyAccessors } from './element-property-accessors.ts'
import { type ServeFrame, writeFrameDocument } from './frame-write.ts'
import { type PrintablePagesOptions, printablePaperFrames } from './print-document.ts'

export function definePaperFrameServing(prototype: object): void {
  defineElementPropertyAccessors(
    prototype,
    () => ({ serveFrame: undefined as ServeFrame | undefined }),
    (host) => {
      const paper = host as { imposed: Imposed | null; paint(): void }
      if (paper.imposed) paper.paint()
    },
  )
}

export function writePrintablePaper(
  box: HTMLElement,
  pages: HtmlPage[],
  imposition: Imposition,
  imposed: Imposed,
  paper: number,
  options: PrintablePagesOptions,
  side: 'front' | 'back',
  serveFrame: ServeFrame,
  failed: (reason: unknown) => void,
): void {
  const frames = printablePaperFrames(pages, imposition, imposed, paper, options, side)
  box.innerHTML = frames.map((frame) => frame.markup).join('')
  const elements = [...box.querySelectorAll<HTMLIFrameElement>('iframe')]
  frames.forEach((frame, index) => {
    const element = elements[index]
    if (element) void writeFrameDocument(element, frame.document, 'printed-page', serveFrame).catch(failed)
  })
}
