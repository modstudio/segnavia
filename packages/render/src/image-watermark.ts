import { paperPixels, sheetMm, type TextDirection } from '@segnavia/format'
import type { Page as Tab } from 'playwright-core'
import { type BrowserTabSetup, markupAssetRefusal } from './browser-tab.ts'
import { RenderRefusedError } from './errors.ts'
import type { PageFontFacts } from './overflow.ts'
import { pageFontFacts } from './page-render.ts'
import { fitWatermarkText } from './watermark-fit.ts'
import { type WatermarkPage, watermarkMarkup } from './watermark-markup.ts'
import { type Watermark, watermarkPageNumbers } from './watermark-options.ts'

const CSS_PIXELS_PER_POINT = 96 / 72

export interface ImageWatermarkPageInput {
  viewport: { width: number; height: number }
  direction: TextDirection
  lang?: string
  fontFamily?: string
  trim?: { width: number; height: number }
}

export function imageWatermarkPage(input: ImageWatermarkPageInput): WatermarkPage {
  const trim = input.trim ?? input.viewport
  const x = (input.viewport.width - trim.width) / 2
  const y = (input.viewport.height - trim.height) / 2
  const points = (pixels: number) => pixels / CSS_PIXELS_PER_POINT
  return {
    media: { width: points(input.viewport.width), height: points(input.viewport.height) },
    trim: { x: points(x), y: points(y), width: points(trim.width), height: points(trim.height) },
    direction: input.direction,
    ...(input.lang ? { lang: input.lang } : {}),
    ...(input.fontFamily ? { fontFamily: input.fontFamily } : {}),
  }
}

export function printedImageTrim(print: Parameters<typeof sheetMm>[0]): { width: number; height: number } {
  const trim = sheetMm(print)
  return { width: paperPixels(trim.width), height: paperPixels(trim.height) }
}

export function selectedImageWatermarkMarkup(watermark: Watermark | undefined, pageNumber: number, page: WatermarkPage): string | undefined {
  if (!watermark) return undefined
  const selected = new Set(watermarkPageNumbers(watermark, pageNumber, false))
  return selected.has(pageNumber) ? watermarkMarkup(watermark, page) : undefined
}

const OVERLAY_STYLE = `
:host{all:initial!important;position:fixed!important;inset:0!important;display:block!important;overflow:hidden!important;pointer-events:none!important;z-index:2147483647!important;contain:strict!important}
*,*::before,*::after{box-sizing:border-box}
`

export async function injectImageWatermark(tab: Tab, markup: string, options: Pick<BrowserTabSetup, 'scripts' | 'origins'>, fontFaceCss = ''): Promise<void> {
  const assetRefusal = markupAssetRefusal(markup, options)
  if (assetRefusal) throw new RenderRefusedError(assetRefusal)
  const root = await tab.evaluateHandle(
    ({ html, css, faces }) => {
      if (faces) {
        const faceStyle = document.createElement('style')
        faceStyle.textContent = faces
        document.head.append(faceStyle)
      }
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'closed' })
      const style = document.createElement('style')
      style.textContent = css
      const layer = document.createElement('div')
      layer.innerHTML = html
      shadow.append(style, layer)
      document.documentElement.append(host)
      return shadow
    },
    { html: markup, css: OVERLAY_STYLE, faces: fontFaceCss },
  )
  try {
    await tab.evaluate(() => document.fonts.ready)
    await root.evaluate(fitWatermarkText)
    const failedImages = await root.evaluate(async (shadow) => {
      const images = [...(shadow as ShadowRoot).querySelectorAll('img')]
      const results = await Promise.allSettled(images.map((image) => image.decode()))
      return results.flatMap((result, index) => {
        if (result.status === 'fulfilled') return []
        const image = images[index]
        return [image?.currentSrc || image?.src || image?.getAttribute('src') || 'an unnamed image']
      })
    })
    if (failedImages.length > 0) {
      throw new RenderRefusedError(
        `The image watermark could not decode ${failedImages.join(', ')}; approve its origin or omit the image to clear this refusal.`,
      )
    }
  } catch (error) {
    if (error instanceof RenderRefusedError) throw error
    throw new RenderRefusedError(
      `The image watermark overlay could not be prepared: ${error instanceof Error ? error.message : String(error)}; change the watermark or omit it to clear this refusal.`,
    )
  } finally {
    await root.dispose()
  }
}

export async function nestedFrameFontFacts(tab: Tab): Promise<PageFontFacts> {
  const frame = tab.frames().find((candidate) => candidate !== tab.mainFrame())
  return frame ? pageFontFacts(frame) : {}
}
