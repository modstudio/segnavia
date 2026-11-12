import { type Deck, resolveDirection } from '@segnavia/format'
import { hasDiagram } from '@segnavia/frame/diagrams'
import { type PrintOptions, printableDeckValue, resolveDeckMedia } from '@segnavia/frame/print-document'
import type { EstablishedPageDay } from '@segnavia/html'
import { fontLoadSetup, type TabRunner } from './browser-tab.ts'
import { captureImage } from './capture-image.ts'
import { resolveDeckFonts } from './deck-pdf.ts'
import { fontFaces } from './font-faces.ts'
import { enforceImageBytes } from './image-bytes.ts'
import { imageWatermarkPage, injectImageWatermark, nestedFrameFontFamily, selectedImageWatermarkMarkup } from './image-watermark.ts'
import { assetSetup, type ParsedComposedRenderOptions, type SlideImageOptions } from './options.ts'
import { outputDate } from './output-date.ts'
import { surfacePreflight } from './preflight.ts'
import { proofCapturedImage, proofCaptureOptions } from './proof-image.ts'
import type { RenderDeadline } from './render-deadline.ts'
import { renderReadiness, waitForDiagramReadiness } from './render-readiness.ts'
import { slotsForDocument } from './slot-document.ts'
import { fillDeckForDay } from './slot-fill.ts'
import { stampImage } from './stamp-image.ts'

interface SlideImageServices {
  withTab: TabRunner
  diagramScript(html: string): Promise<string | undefined>
}

export async function renderSlideImage(
  deck: Deck,
  index: number,
  opts: ParsedComposedRenderOptions<SlideImageOptions> & Pick<PrintOptions, 'inline'>,
  services: SlideImageServices,
  deadline: RenderDeadline,
  established: EstablishedPageDay,
): Promise<Uint8Array> {
  const { value: filled, slots } = await fillDeckForDay(deck, established.day, established.slots, deadline.signal)
  const preparedDeck = await resolveDeckMedia(filled, opts.placements, 'print', deadline.signal, established.day)
  const slide = preparedDeck.slides[index]
  if (!slide) throw new RangeError(`The deck has no slide ${index + 1}.`)
  const single: Deck = { ...preparedDeck, slides: [slide] }
  const resolvedFonts = await resolveDeckFonts(preparedDeck, opts, deadline.signal)
  const preflight = surfacePreflight(opts.preflight, 1)
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
      preflightReport: preflight?.capture({ index, folio: String(index + 1) }),
    },
    async (tab) => {
      await waitForDiagramReadiness(tab.locator('iframe').contentFrame(), diagramReadiness)
      preflight?.complete()
      const fontFamily = opts.watermark ? await nestedFrameFontFamily(tab) : undefined
      const watermark = selectedImageWatermarkMarkup(
        opts.watermark,
        index + 1,
        imageWatermarkPage({
          viewport: deck.size,
          direction: resolveDirection(deck.dir, deck.lang, deck.title),
          ...(deck.lang ? { lang: deck.lang } : {}),
          ...(fontFamily ? { fontFamily } : {}),
        }),
      )
      if (watermark) await injectImageWatermark(tab, watermark)
      const image = await proofCapturedImage(tab, await captureImage(tab, proofCaptureOptions(opts), false), opts)
      return enforceImageBytes(stampImage(image, outputDate([established.day])), opts.limits?.bytes)
    },
  )
}
