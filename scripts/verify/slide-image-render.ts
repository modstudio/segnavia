import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'
import { screenDeck } from '../screen-document.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const watermarkRegion = (file: string) =>
  execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', 'crop=768:360:256:180', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])

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
  const plainSlideFile = path.join(work, 'slide-plain.png')
  const markedSlideFile = path.join(work, 'slide-watermarked.png')
  writeFileSync(plainSlideFile, plainSlide)
  writeFileSync(markedSlideFile, markedSlide)
  check('a slide image with a text watermark changes in the watermark region', !watermarkRegion(plainSlideFile).equals(watermarkRegion(markedSlideFile)))
}
