import type { Deck } from '@segnavia/format'
import { hasDiagram } from '@segnavia/frame/diagrams'
import { type PrintOptions, printableDeckValue, resolveDeckMedia } from '@segnavia/frame/print-document'
import { fontLoadSetup, type TabRunner } from './browser-tab.ts'
import { captureImage } from './capture-image.ts'
import { resolveDeckFonts } from './deck-pdf.ts'
import { fontFaces } from './font-faces.ts'
import { assetSetup, type ImageOptions } from './options.ts'
import { proofCapturedImage, proofCaptureOptions } from './proof-image.ts'
import type { RenderDeadline } from './render-deadline.ts'
import { renderReadiness, waitForDiagramReadiness } from './render-readiness.ts'
import { slotsForDocument } from './slot-document.ts'
import { filledDeck } from './slot-fill.ts'

interface SlideImageServices {
  withTab: TabRunner
  diagramScript(html: string): Promise<string | undefined>
}

export async function renderSlideImage(
  deck: Deck,
  index: number,
  opts: ImageOptions & Pick<PrintOptions, 'inline'>,
  services: SlideImageServices,
  deadline: RenderDeadline,
): Promise<Uint8Array> {
  const { value: filled, slots } = await filledDeck(deck, opts.slots, deadline.signal)
  const preparedDeck = await resolveDeckMedia(filled, opts.placements, 'print', deadline.signal)
  const slide = preparedDeck.slides[index]
  if (!slide) throw new RangeError(`The deck has no slide ${index + 1}.`)
  const single: Deck = { ...preparedDeck, slides: [slide] }
  const resolvedFonts = await resolveDeckFonts(preparedDeck, opts, deadline.signal)
  const slideHtml = 'kind' in slide.content && slide.content.kind === 'html' ? slide.content.html : ''
  const diagramScript = await services.diagramScript(slideHtml)
  const diagramReadiness = renderReadiness('refuse', hasDiagram(slideHtml), opts.waitForPageReady !== false)
  const css = `${resolvedFonts.fontCss}${fontFaces(opts.fonts)}${opts.css ?? ''}`
  const html = printableDeckValue(single, { inline: opts.inline, css, origins: opts.origins, diagramScript })
  return services.withTab(
    {
      viewport: deck.size,
      scripts: true,
      scale: opts.scale,
      html,
      slots: slotsForDocument(slots, [[index]]),
      readiness: renderReadiness('refuse', false, false),
      boundMs: opts.boundMs,
      deadline,
      beforeOutput: opts.beforeOutput,
      ...assetSetup(opts),
      ...fontLoadSetup(resolvedFonts.fontFailures, opts.fontLoad?.report),
    },
    async (tab) => {
      await waitForDiagramReadiness(tab.locator('iframe').contentFrame(), diagramReadiness)
      return proofCapturedImage(tab, await captureImage(tab, proofCaptureOptions(opts), false), opts)
    },
  )
}
