import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { notesLayoutGeometry } from '@segnavia/frame/print-document'
import { backgroundDeck, deckPdfShades } from '../demo-deck-pdf-fixtures.ts'
import { type Raster, rasterCssPixels, rasterPdf } from './pdf-raster.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const near = (actual: number, expected: number) => Math.abs(actual - expected) <= 3

export function verifyDeckRender(output: string, work: string, check: Check): void {
  const imageRasters: Raster[] = []
  for (const scripts of ['refuse', 'sandboxed'] as const) {
    const slidesFile = `deck-backgrounds-${scripts}-slides`
    const notesFile = `deck-backgrounds-${scripts}-notes`
    const info = execFileSync('pdfinfo', [path.join(output, `${slidesFile}.pdf`)], { encoding: 'utf8' })
    const slides = [1, 2, 3, 4].map((page) => rasterPdf(output, work, slidesFile, page))
    const slideValues = [
      rasterCssPixels(slides[0] as Raster, 1000, 600),
      rasterCssPixels(slides[1] as Raster, 1000, 600),
      rasterCssPixels(slides[2] as Raster, 300, 200),
    ]
    const outsideDiv = rasterCssPixels(slides[2] as Raster, 50, 50)
    check(
      `deck PDF backgrounds print in slides layout with ${scripts} scripts`,
      /Pages:\s+4\b/.test(info) &&
        near(slideValues[0] ?? 255, deckPdfShades.root) &&
        near(slideValues[1] ?? 255, deckPdfShades.body) &&
        near(slideValues[2] ?? 255, deckPdfShades.div) &&
        outsideDiv > 250,
      `pages=${info.match(/Pages:\s+\d+/)?.[0] ?? 'missing'}, backgrounds=${slideValues.join(',')}, outside div=${outsideDiv}`,
    )
    imageRasters.push(slides[3] as Raster)

    const geometry = notesLayoutGeometry(backgroundDeck(scripts, 'image').size)
    const localPoints = [
      { x: 1000, y: 600, shade: deckPdfShades.root },
      { x: 1000, y: 600, shade: deckPdfShades.body },
      { x: 300, y: 200, shade: deckPdfShades.div },
    ]
    const notesValues = localPoints.map(({ x, y }, index) =>
      rasterCssPixels(rasterPdf(output, work, notesFile, index + 1), geometry.slide.x + x * geometry.slide.scale, geometry.slide.y + y * geometry.slide.scale),
    )
    const firstNotes = rasterPdf(output, work, notesFile, 1)
    const outside = rasterCssPixels(firstNotes, geometry.slide.x - geometry.border - 12, geometry.slide.y + geometry.slide.height / 2)
    const border = rasterCssPixels(firstNotes, geometry.slide.x - geometry.border / 2, geometry.slide.y - geometry.border / 2)
    const inside = rasterCssPixels(firstNotes, geometry.slide.x + 0.5, geometry.slide.y + 0.5)
    const text = execFileSync('pdftotext', [path.join(output, `${notesFile}.pdf`), '-'], { encoding: 'utf8' })
    check(
      `deck PDF backgrounds and notes print in notes layout with ${scripts} scripts`,
      notesValues.every((value, index) => near(value, localPoints[index]?.shade ?? -1)) &&
        outside > 250 &&
        near(border, 204) &&
        near(inside, deckPdfShades.root) &&
        ['Root background notes.', 'Body background notes.', 'Div background notes.', 'Image slide notes.'].every((note) => text.includes(note)),
      `backgrounds=${notesValues.join(',')}, border=${border}, inside=${inside}, outside thumbnail=${outside}`,
    )
  }
  const [refusedImage, sandboxedImage] = imageRasters
  const sameImage =
    refusedImage !== undefined &&
    sandboxedImage !== undefined &&
    refusedImage.width === sandboxedImage.width &&
    refusedImage.height === sandboxedImage.height &&
    refusedImage.pixels.every((value, index) => value === sandboxedImage.pixels[index]) &&
    refusedImage.pixels.some((value) => value < 245)
  check('the image slide is unchanged between deck script settings and is not blank', sameImage)
}
