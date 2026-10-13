import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fitPage, Imposition, impose, MM_PER_PT, Page, printBoxes } from '@segnavia/format'
import {
  bleedGridImposition,
  bleedGridPages,
  bleedGridShades,
  clippedBleedGridImposition,
  containedImposition,
  coveringImposition,
  fixedImposedPage,
  growingFixedImposition,
  growingFixedPages,
  labelsImposition,
  postcardBackPage,
  postcardPage,
} from '../demo-page-fixtures.ts'
import { rasterPdf, rasterMillimeters as rasterValue } from './pdf-raster.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

function closeBox(actual: number[] | undefined, expected: number[]): boolean {
  return actual?.every((value, index) => Math.abs(value - (expected[index] ?? Number.NaN)) <= 0.5) ?? false
}

export function verifyPagesRender(output: string, work: string, check: Check): void {
  const imposedInfo = (file: string) => execFileSync('pdfinfo', [path.join(output, file)], { encoding: 'utf8' })
  check(
    '30 labels fill one paper and a 31st label starts a second paper',
    /Pages:\s+1\b/.test(imposedInfo('pages-labels.pdf')) && /Pages:\s+2\b/.test(imposedInfo('pages-labels-31.pdf')),
  )

  const labelImposition = Imposition.parse(labelsImposition)
  const labelPlacements = impose(labelImposition, 30).placements
  const labelWords = execFileSync('pdftotext', ['-bbox', path.join(output, 'pages-labels.pdf'), '-'], { encoding: 'utf8' })
  const words = Array.from(labelWords.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)<\/word>/g)).map((match) => ({
    xMin: Number(match[1]),
    yMin: Number(match[2]),
    xMax: Number(match[3]),
    yMax: Number(match[4]),
    text: match[5],
  }))
  const labelInside = (number: number) => {
    const at = words.findIndex((word, index) => word.text === 'Label' && words[index + 1]?.text === String(number))
    const numberWord = words[at + 1]
    const placement = labelPlacements[number - 1]
    if (at < 0 || !numberWord || !placement) return false
    const word = words[at]
    if (!word) return false
    const trim = placement.trim
    return (
      Math.min(word.xMin, numberWord.xMin) >= trim.x / MM_PER_PT - 1 &&
      Math.min(word.yMin, numberWord.yMin) >= trim.y / MM_PER_PT - 1 &&
      Math.max(word.xMax, numberWord.xMax) <= (trim.x + trim.width) / MM_PER_PT + 1 &&
      Math.max(word.yMax, numberWord.yMax) <= (trim.y + trim.height) / MM_PER_PT + 1
    )
  }
  check('labels 1, 3, 4 and 30 lie inside their imposed trims', [1, 3, 4, 30].every(labelInside))
  const labelRaster = rasterPdf(output, work, 'pages-labels')
  const firstLabel = labelPlacements[0]
  const labelBackground = firstLabel
    ? rasterValue(labelRaster, firstLabel.trim.x + firstLabel.trim.width - 3, firstLabel.trim.y + firstLabel.trim.height - 3)
    : 255
  check('the first imposed label paints its root background', Math.abs(labelBackground - 242) <= 5, `gray=${labelBackground}`)

  const rtlWords = execFileSync('pdftotext', ['-bbox', path.join(output, 'pages-labels-rtl.pdf'), '-'], { encoding: 'utf8' })
  const firstRtl = rtlWords.match(/<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>Label<\/word>\s*<word[^>]*>1<\/word>/)
  const rtlPlacement = impose(Imposition.parse({ ...labelsImposition, dir: 'rtl' }), 30).placements[0]
  check(
    'a right-to-left imposition puts Label 1 in the top-right cell',
    Boolean(
      firstRtl && rtlPlacement && Number(firstRtl[1]) >= rtlPlacement.trim.x / MM_PER_PT - 1 && Number(firstRtl[2]) >= rtlPlacement.trim.y / MM_PER_PT - 1,
    ),
    firstRtl?.[0] ?? 'Label 1 not found',
  )

  const verifyFixed = (file: string, input: typeof coveringImposition, cover: boolean) => {
    const parsed = Imposition.parse(input)
    const placement = impose(parsed, 1).placements[0]
    if (!placement) throw new Error('The fixed-page imposition has no placement.')
    const fit = fitPage(Page.parse(fixedImposedPage), placement, parsed.fit)
    const raster = rasterPdf(output, work, file)
    if (cover) {
      return {
        ok:
          rasterValue(raster, placement.trim.x + placement.trim.width / 2, placement.trim.y + placement.trim.height / 2) < 120 &&
          rasterValue(raster, placement.bleedBox.x + 1, placement.bleedBox.y + placement.bleedBox.height / 2) < 120 &&
          rasterValue(raster, placement.bleedBox.x - 2, placement.bleedBox.y + placement.bleedBox.height / 2) > 245,
        detail: `scale=${fit.scale}, crop=${JSON.stringify(fit.crop)}`,
      }
    }
    return {
      ok:
        rasterValue(raster, placement.trim.x + placement.trim.width / 2, placement.trim.y + fit.bands.block / 2) > 245 &&
        rasterValue(raster, placement.trim.x + placement.trim.width / 2, placement.trim.y + placement.trim.height / 2) < 120,
      detail: `scale=${fit.scale}, bands=${JSON.stringify(fit.bands)}`,
    }
  }
  const covered = verifyFixed('pages-cover', coveringImposition, true)
  check('a covering fixed page paints through its bleed but not beyond its bleed box', covered.ok, covered.detail)
  const contained = verifyFixed('pages-contain', containedImposition, false)
  check('a contained fixed page leaves its reported band white', contained.ok, contained.detail)

  const verifyBleedGrid = () => {
    const parsed = Imposition.parse(bleedGridImposition)
    const placements = impose(parsed, bleedGridPages.length).placements
    const raster = rasterPdf(output, work, 'pages-bleed-grid')
    const painted = placements.every((placement, index) => {
      const shade = bleedGridShades[index]
      if (shade === undefined) return false
      const points = [
        [placement.trim.x - 1, placement.trim.y + placement.trim.height / 2],
        [placement.trim.x + placement.trim.width + 1, placement.trim.y + placement.trim.height / 2],
        [placement.trim.x + placement.trim.width / 2, placement.trim.y - 1],
        [placement.trim.x + placement.trim.width / 2, placement.trim.y + placement.trim.height + 1],
      ]
      return points.every(([x, y]) => Math.abs(rasterValue(raster, x ?? 0, y ?? 0) - shade) <= 3)
    })
    const [topLeft, topRight, bottomLeft] = placements
    if (!topLeft || !topRight || !bottomLeft) return { painted: false, gaps: false }
    const columnMiddle = (topLeft.trim.x + topLeft.trim.width + topRight.trim.x) / 2
    const rowMiddle = (topLeft.trim.y + topLeft.trim.height + bottomLeft.trim.y) / 2
    const gaps =
      [topLeft, bottomLeft].every((placement) => rasterValue(raster, columnMiddle, placement.trim.y + placement.trim.height / 2) > 250) &&
      [topLeft, topRight].every((placement) => rasterValue(raster, placement.trim.x + placement.trim.width / 2, rowMiddle) > 250)
    return { painted, gaps }
  }
  const bleedGrid = verifyBleedGrid()
  check('fluid imposed pages paint 2mm bleed on every side of every cell', bleedGrid.painted)
  check('a 6mm grid gap stays white between neighboring 2mm bleeds', bleedGrid.gaps)

  const verifyClippedBleedGrid = () => {
    const parsed = Imposition.parse(clippedBleedGridImposition)
    const placements = impose(parsed, bleedGridPages.length).placements
    const raster = rasterPdf(output, work, 'pages-bleed-grid-clipped')
    const [topLeft, topRight, bottomLeft, bottomRight] = placements
    if (!topLeft || !topRight || !bottomLeft || !bottomRight) return false
    const boundaries = [
      { first: topLeft, second: topRight, firstShade: 60, secondShade: 100, axis: 'x' },
      { first: bottomLeft, second: bottomRight, firstShade: 140, secondShade: 180, axis: 'x' },
      { first: topLeft, second: bottomLeft, firstShade: 60, secondShade: 140, axis: 'y' },
      { first: topRight, second: bottomRight, firstShade: 100, secondShade: 180, axis: 'y' },
    ] as const
    return boundaries.every(({ first, second, firstShade, secondShade, axis }) => {
      const middle = axis === 'x' ? (first.trim.x + first.trim.width + second.trim.x) / 2 : (first.trim.y + first.trim.height + second.trim.y) / 2
      const across = axis === 'x' ? first.trim.y + first.trim.height / 2 : first.trim.x + first.trim.width / 2
      const own = axis === 'x' ? rasterValue(raster, middle - 0.5, across) : rasterValue(raster, across, middle - 0.5)
      const neighbor = axis === 'x' ? rasterValue(raster, middle + 0.5, across) : rasterValue(raster, across, middle + 0.5)
      return Math.abs(own - firstShade) <= 3 && Math.abs(neighbor - secondShade) <= 3
    })
  }
  check('bleed clipped by a 2mm gap changes to the neighboring shade at the gap midline', verifyClippedBleedGrid())

  const growingImposition = Imposition.parse(growingFixedImposition)
  const growingPlacements = impose(growingImposition, growingFixedPages.length).placements
  const growingRaster = rasterPdf(output, work, 'pages-growing-fixed')
  const [growingNeighbor, growingTarget] = growingPlacements
  const growingFixedOk =
    growingNeighbor !== undefined &&
    growingTarget !== undefined &&
    growingTarget.bleed.left === 0 &&
    growingTarget.bleed.right > 0 &&
    Math.abs(rasterValue(growingRaster, growingTarget.trim.x + growingTarget.trim.width - 1, growingTarget.trim.y + growingTarget.trim.height / 2) - 170) <=
      3 &&
    Math.abs(rasterValue(growingRaster, growingNeighbor.trim.x + 1, growingNeighbor.trim.y + growingNeighbor.trim.height / 2) - 70) <= 3
  check('a fixed-width growing page with no left bleed fills its trim without repainting its neighbor', growingFixedOk)

  const info = execFileSync('pdfinfo', ['-box', '-f', '1', '-l', '2', path.join(output, 'pages-postcard.pdf')], { encoding: 'utf8' })
  const boxesMatch = [Page.parse(postcardPage), Page.parse(postcardBackPage)].every((page, index) => {
    if (!page.print) return false
    const boxes = printBoxes(page.print)
    const actual = (name: string) =>
      info
        .match(new RegExp(`Page\\s+${index + 1}\\s+${name}:\\s+([\\d.-]+)\\s+([\\d.-]+)\\s+([\\d.-]+)\\s+([\\d.-]+)`))
        ?.slice(1)
        .map(Number)
    const expected = (box: { x: number; y: number; width: number; height: number }) =>
      [box.x, boxes.media.height - box.y - box.height, box.x + box.width, boxes.media.height - box.y].map((mm) => mm / MM_PER_PT)
    return (
      closeBox(actual('MediaBox'), [0, 0, boxes.media.width / MM_PER_PT, boxes.media.height / MM_PER_PT]) &&
      closeBox(actual('BleedBox'), expected(boxes.bleedBox)) &&
      closeBox(actual('TrimBox'), expected(boxes.trim))
    )
  })
  check('postcard front and back keep both pages and each page’s print boxes', /Pages:\s+2\b/.test(info) && boxesMatch)

  const limits = readFileSync(path.join(output, 'pages-limits.txt'), 'utf8')
  check('the imposed maxSheets ceiling counts papers and names both counts', limits === 'The PDF has 2 sheets; the limit is 1.', limits)
}
