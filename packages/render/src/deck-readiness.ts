import type { Deck, ImageFit } from '@segnavia/format'
import { COMPOSE_FAILURE_ATTRIBUTE, PRINT_READY_ATTRIBUTE } from '@segnavia/frame/bridge'
import { hasDiagram } from '@segnavia/frame/diagrams'
import { fitImage, imageLayerStyles } from '@segnavia/frame/image-fit'
import { SLIDES_READY_DEADLINE_MS } from '@segnavia/frame/print-document'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from './errors.ts'
import { type RenderReadiness, readinessRefusal, renderReadiness, waitForDiagramReadiness } from './render-readiness.ts'

async function watchForLayoutFailure(tab: Tab, waiting: () => boolean): Promise<string | null> {
  while (waiting()) {
    for (const frame of typeof tab.frames === 'function' ? tab.frames() : []) {
      const reason = await frame.evaluate((attribute) => document.documentElement.getAttribute(attribute), COMPOSE_FAILURE_ATTRIBUTE).catch(() => null)
      if (reason) return reason
    }
    if (waiting()) await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return null
}
export async function waitForPrintReady(tab: Tab, readiness: RenderReadiness): Promise<void> {
  const printed = tab
    .locator(`html[${PRINT_READY_ATTRIBUTE}]`)
    .waitFor({ timeout: SLIDES_READY_DEADLINE_MS })
    .then(
      () => true,
      () => false,
    )
  let outcome: { ready: boolean; reason: string | null }
  if (readiness.layouts) {
    let waiting = true
    const failure = watchForLayoutFailure(tab, () => waiting)
    outcome = await Promise.race([printed.then((ready) => ({ ready, reason: null })), failure.then((reason) => ({ ready: false, reason }))])
    waiting = false
    await failure
  } else {
    outcome = { ready: await printed, reason: null }
  }
  if (outcome.reason) throw new RenderRefusedError(outcome.reason)
  if (!outcome.ready && readiness.layouts) {
    throw new RenderRefusedError(readinessRefusal(readiness, { author: true, diagrams: true, layouts: false }, SLIDES_READY_DEADLINE_MS / 1000))
  }
  await waitForDiagramReadiness(tab, readiness)
}

export async function placeRenderedImages(tab: Tab): Promise<void> {
  const layers = tab.locator('[data-segnavia-image-layer]')
  const facts = await layers.evaluateAll((elements) =>
    elements.map((element) => {
      const layer = element as HTMLElement
      const image = layer.querySelector('img') as HTMLImageElement | null
      return {
        slide: { width: Number(layer.dataset.slideWidth), height: Number(layer.dataset.slideHeight) },
        image: { width: image?.naturalWidth ?? 0, height: image?.naturalHeight ?? 0 },
        fit: layer.dataset.fit,
        frame: layer.dataset.frame === 'true',
      }
    }),
  )
  const styles = facts.map((fact) => {
    if (fact.image.width <= 0 || fact.image.height <= 0) return null
    const placement = fitImage(fact.slide, fact.image, fact.fit as ImageFit, undefined, fact.frame)
    return imageLayerStyles(fact.image, placement, fact.slide)
  })
  await layers.evaluateAll((elements, values) => {
    elements.forEach((element, index) => {
      const styles = values[index]
      if (!styles) return
      const layer = element as HTMLElement
      const image = layer.querySelector('img') as HTMLImageElement | null
      if (!image) return
      Object.assign(layer.style, styles.layer)
      Object.assign(image.style, styles.image)
    })
  }, styles)
}

// The step that makes a slide's tab ready to print: an HTML slide waits for its bridge, diagrams and layout providers; an image slide places its image layers.
export function slidePrepare(content: Deck['slides'][number]['content'], layouts: boolean, author: boolean): ((tab: Tab) => Promise<void>) | undefined {
  if (!('kind' in content)) return undefined
  if (content.kind === 'html') return (tab) => waitForPrintReady(tab, renderReadiness('refuse', hasDiagram(content.html), author, layouts))
  if (content.kind === 'image') return placeRenderedImages
  return undefined
}
