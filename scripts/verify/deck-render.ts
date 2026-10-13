import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fitPage, Imposition, impose, MM_PER_PT, PX_PER_MM, pagePlacementLayout } from '@segnavia/format'
import { notesLayoutGeometry } from '@segnavia/frame/print-document'
import { backgroundDeck, deckPdfShades, handoutDeck, handoutImposition } from '../demo-deck-pdf-fixtures.ts'
import { type Raster, rasterCssPixels, rasterMillimeters, rasterPdf } from './pdf-raster.ts'

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

  const imposition = Imposition.parse(handoutImposition)
  const deck = handoutDeck('refuse', 'image', {
    key: 'fixture',
    title: 'Fixture',
    file: 'image',
    size: { width: 1280, height: 720 },
    scale: 1,
    capturedAt: 'now',
    annotations: [],
    description: null,
    tags: [],
    annotatedFile: null,
    dir: 'ltr',
    meta: {},
  })
  const imposed = impose(imposition, deck.slides.length)
  const info = execFileSync('pdfinfo', [path.join(output, 'deck-handout.pdf')], { encoding: 'utf8' })
  check('an imposed seven-slide deck prints on two papers', /Pages:\s+2\b/.test(info), info.match(/Pages:\s+\d+/)?.[0])
  const duplexImposition = Imposition.parse({ ...handoutImposition, sides: 'two' })
  const duplexImposed = impose(duplexImposition, deck.slides.length)
  const duplexInfo = execFileSync('pdfinfo', [path.join(output, 'deck-handout-two-sided.pdf')], { encoding: 'utf8' })
  check(
    'a two-sided seven-slide handout emits two PDF pages per physical paper',
    new RegExp(`Pages:\\s+${duplexImposed.papers * 2}\\b`).test(duplexInfo),
    duplexInfo.match(/Pages:\s+\d+/)?.[0],
  )

  const xml = execFileSync('pdftotext', ['-bbox', path.join(output, 'deck-handout.pdf'), '-'], { encoding: 'utf8' })
  const pdfPages = [...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map((match) => match[1] ?? '')
  const textInside = (number: number) => {
    const placement = imposed.placements[number - 1]
    if (!placement) return false
    const words = [...(pdfPages[placement.paper] ?? '').matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)<\/word>/g)]
    const at = words.findIndex((word, index) => word[5] === 'Slide' && words[index + 1]?.[5] === String(number))
    const pair = [words[at], words[at + 1]]
    if (at < 0 || pair.some((word) => !word)) return false
    return (
      Math.min(...pair.map((word) => Number(word?.[1]))) >= placement.trim.x / MM_PER_PT - 1 &&
      Math.min(...pair.map((word) => Number(word?.[2]))) >= placement.trim.y / MM_PER_PT - 1 &&
      Math.max(...pair.map((word) => Number(word?.[3]))) <= (placement.trim.x + placement.trim.width) / MM_PER_PT + 1 &&
      Math.max(...pair.map((word) => Number(word?.[4]))) <= (placement.trim.y + placement.trim.height) / MM_PER_PT + 1
    )
  }
  check('handout text on slides 1, 2, 6 and 7 lies inside its trim, including slide 7 on paper two', [1, 2, 6, 7].every(textInside))

  const raster = rasterPdf(output, work, 'deck-handout')
  const localShade = (slide: number, x: number, y: number) => {
    const placement = imposed.placements[slide - 1]
    if (!placement) return 255
    const fit = fitPage({ size: deck.size }, placement, imposition.fit)
    const layout = pagePlacementLayout(deck.size, placement, fit)
    return rasterMillimeters(raster, layout.paper.x + (x * fit.scale) / PX_PER_MM, layout.paper.y + (y * fit.scale) / PX_PER_MM)
  }
  const backgroundValues = [localShade(1, 1000, 600), localShade(2, 1000, 600), localShade(3, 300, 200)]
  const first = imposed.placements[0]
  const second = imposed.placements[1]
  const fourth = imposed.placements[3]
  if (!first || !second || !fourth) throw new Error('The handout fixture is missing a placement.')
  const firstFit = fitPage({ size: deck.size }, first, imposition.fit)
  const band = rasterMillimeters(raster, first.trim.x + first.trim.width / 2, first.trim.y + firstFit.bands.block / 2)
  const gap = rasterMillimeters(raster, (first.trim.x + first.trim.width + second.trim.x) / 2, first.trim.y + first.trim.height / 2)
  let imageDark = false
  for (let x = fourth.trim.x + 5; x < fourth.trim.x + fourth.trim.width - 5; x += 5) {
    for (let y = fourth.trim.y + 5; y < fourth.trim.y + fourth.trim.height - 5; y += 5) imageDark ||= rasterMillimeters(raster, x, y) < 245
  }
  check(
    'an imposed handout paints three slide backgrounds, leaves the contain band and grid gap white, and paints the image cell',
    backgroundValues.every((value, index) => near(value, [deckPdfShades.root, deckPdfShades.body, deckPdfShades.div][index] ?? -1)) &&
      band > 250 &&
      gap > 250 &&
      imageDark,
    `backgrounds=${backgroundValues.join(',')}, band=${band}, gap=${gap}, image=${imageDark}`,
  )

  const coverInput = { ...handoutImposition, fit: 'cover' as const, bleed: 3 }
  const cover = Imposition.parse(coverInput)
  const coverPlacement = impose(cover, deck.slides.length).placements[0]
  if (!coverPlacement) throw new Error('The covering handout fixture is missing its first placement.')
  const coverRaster = rasterPdf(output, work, 'deck-handout-cover')
  const bleedShade = rasterMillimeters(coverRaster, coverPlacement.bleedBox.x + 1, coverPlacement.trim.y + coverPlacement.trim.height / 2)
  const outsideBleed = rasterMillimeters(coverRaster, coverPlacement.bleedBox.x - 2, coverPlacement.trim.y + coverPlacement.trim.height / 2)
  check(
    'a covering handout paints the first slide through its bleed and leaves paper outside the bleed white',
    near(bleedShade, deckPdfShades.root) && outsideBleed > 250,
    `bleed=${bleedShade}, outside=${outsideBleed}`,
  )

  const limits = readFileSync(path.join(output, 'deck-handout-limits.txt'), 'utf8')
  check('an imposed deck maxSheets limit counts PDF pages and names both counts', limits === 'The PDF has 2 sheets; the limit is 1.', limits)
  const notes = readFileSync(path.join(output, 'deck-handout-notes.txt'), 'utf8')
  check(
    'an imposed deck refuses notes while naming both conflicting options and both ways to clear it',
    notes === "layout: 'notes' and imposition cannot be combined. Remove either layout: 'notes' or imposition to clear this refusal.",
    notes,
  )
}
