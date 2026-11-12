import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'
import { screenDeck } from '../screen-document.ts'
import { decodePng } from './png-pixels.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

// The centered 768x360 region of a 1280x720 slide, where the default watermark sits.
function watermarkRegion(png: Uint8Array): Buffer {
  const { width, pixels } = decodePng(png)
  const rows: Uint8Array[] = []
  for (let y = 180; y < 540; y++) rows.push(pixels.subarray((y * width + 256) * 3, (y * width + 1024) * 3))
  return Buffer.concat(rows)
}

export async function verifySlideImageRender(renderer: Renderer, work: string, check: Check): Promise<void> {
  const deck = screenDeck([{ type: 'slide', id: 'a', content: { kind: 'html', html: '<h1>x</h1>' } }], {
    title: 'T',
    layout: 'fixed',
    fit: 'contain',
    frame: false,
    size: { width: 1280, height: 720 },
    settings: { scripts: 'refuse' },
  })
  const slide = await renderer.slideImage(deck, 0, { scale: 1 })
  const slideFile = path.join(work, 'slide.png')
  writeFileSync(slideFile, slide)
  check('a slide exports as an image at its canvas size', execFileSync('file', [slideFile], { encoding: 'utf8' }).includes('1280 x 720'))

  const plainSlide = await renderer.slideImage(deck, 0, { scale: 1 })
  const markedSlide = await renderer.slideImage(deck, 0, {
    scale: 1,
    watermark: { text: 'DEMO WATERMARK', opacity: 1, rotation: 0, color: '#000' },
  })
  check('a slide image with a text watermark changes in the watermark region', !watermarkRegion(plainSlide).equals(watermarkRegion(markedSlide)))
}
