import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fitPage, Imposition, impose, impositionMarks, MM_PER_PT, Page, printBoxes } from '@segnavia/format'
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
  letterFoldImposition,
  letterFoldPages,
  postcardBackPage,
  postcardPage,
  twoSidedCardImposition,
  twoSidedCardPages,
  twoSidedSequenceImposition,
} from '../demo-page-fixtures.ts'
import { rasterPdf, rasterMillimeters as rasterValue } from './pdf-raster.ts'
import { darkestNear } from './pgm.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

function closeBox(actual: number[] | undefined, expected: number[]): boolean {
  return actual?.every((value, index) => Math.abs(value - (expected[index] ?? Number.NaN)) <= 0.5) ?? false
}

export function verifyPagesRender(output: string, work: string, check: Check): void {
  const imposedInfo = (file: string) => execFileSync('pdfinfo', [path.join(output, file)], { encoding: 'utf8' })
  const parentText = (name: string) =>
    execFileSync('pdftotext', ['-layout', path.join(output, `pages-parent-${name}.pdf`), '-'], { encoding: 'utf8' })
      .split('\f')
      .filter(Boolean)
  const english = parentText('english')
  const englishHead = english.filter((page) => page.includes('LETTERHEAD')).length
  const englishFeet = english.map((page, index) => page.includes(`Page ${index + 1} of 3`))
  const englishBreaks = english[1]?.includes('English-40') && !english[1]?.includes('English-41') && english[2]?.includes('English-41')
  const widowCounts = english.map((page) => [...page.matchAll(/WIDOW-\d/g)].length)
  const widowsHonored = widowCounts[0] === 2 && widowCounts[1] === 2
  const keepWhole = english.filter((page) => page.includes('KEEP-A') || page.includes('KEEP-B') || page.includes('KEEP-C')).length === 1
  check(
    'the English flowing letter composes three pages with first-only head, numbered feet, forced break and intact keep',
    english.length === 3 && englishHead === 1 && englishFeet.every(Boolean) && Boolean(englishBreaks) && keepWhole && widowsHonored,
    `pages=${english.length} head=${englishHead} feet=${englishFeet.join(',')} forced=${Boolean(englishBreaks)} keep=${keepWhole} widows=${widowCounts.join(',')}`,
  )

  const englishBoxes = execFileSync('pdftotext', ['-bbox', path.join(output, 'pages-parent-english.pdf'), '-'], { encoding: 'utf8' })
  const bodyBoxes = [...englishBoxes.matchAll(/<word xMin="[\d.]+" yMin="([\d.]+)" xMax="[\d.]+" yMax="([\d.]+)">English-\d+<\/word>/g)]
  const bodyClear = bodyBoxes.every((match) => Number(match[1]) >= 51 && Number(match[2]) <= 741)
  check('the English flowing body stays clear of head and foot regions', bodyBoxes.length === 55 && bodyClear, `words=${bodyBoxes.length} clear=${bodyClear}`)

  const hebrew = parentText('hebrew')
  const hebrewNumbered = hebrew.length === 2 && hebrew[0]?.includes('א') && hebrew[1]?.includes('ב') && hebrew.every((page) => page.includes('מתוך ב'))
  const hebrewHead = hebrew.filter((page) => page.includes('כותרת')).length
  check(
    'the Hebrew flowing letter prints Hebrew folios from the page start with right-to-left recto and verso',
    Boolean(hebrewNumbered) && hebrewHead === 1,
    `pages=${hebrew.length} head=${hebrewHead} numbered=${hebrewNumbered}`,
  )

  const mixed = parentText('mixed')
  const mixedIsolated =
    mixed.length === 2 && mixed[0]?.includes('English opening') && mixed[0]?.includes('כותרת') && mixed.every((page) => page.includes('עמוד'))
  check(
    'the mixed-direction flowing letter keeps body and furniture text present in their own runs',
    Boolean(mixedIsolated),
    `pages=${mixed.length} isolated=${mixedIsolated}`,
  )
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

  const twoSidedTextCheck = (file: string, flip: 'long' | 'short') => {
    const parsed = Imposition.parse({ ...twoSidedCardImposition, flip })
    const imposed = impose(parsed, twoSidedCardPages.length)
    const xml = execFileSync('pdftotext', ['-bbox', path.join(output, `${file}.pdf`), '-'], { encoding: 'utf8' })
    const pdfPages = [...xml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map((match) => match[1] ?? '')
    const textBox = (pdfPage: number, face: 'Front' | 'Back', piece: number) => {
      const words = [...(pdfPages[pdfPage] ?? '').matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)<\/word>/g)]
      const at = words.findIndex((word, index) => word[5] === face && words[index + 1]?.[5] === String(piece))
      const pair = [words[at], words[at + 1]]
      if (at < 0 || pair.some((word) => !word)) return undefined
      return {
        xMin: Math.min(...pair.map((word) => Number(word?.[1]))),
        yMin: Math.min(...pair.map((word) => Number(word?.[2]))),
        xMax: Math.max(...pair.map((word) => Number(word?.[3]))),
        yMax: Math.max(...pair.map((word) => Number(word?.[4]))),
      }
    }
    const inside = (box: ReturnType<typeof textBox>, trim: { x: number; y: number; width: number; height: number }) =>
      Boolean(
        box &&
          box.xMin >= trim.x / MM_PER_PT - 1 &&
          box.yMin >= trim.y / MM_PER_PT - 1 &&
          box.xMax <= (trim.x + trim.width) / MM_PER_PT + 1 &&
          box.yMax <= (trim.y + trim.height) / MM_PER_PT + 1,
      )
    const front1 = imposed.placements.find((placement) => placement.page === 0)
    const back1 = imposed.placements.find((placement) => placement.page === 1)
    const front4 = imposed.placements.find((placement) => placement.page === 6)
    const back4 = imposed.placements.find((placement) => placement.page === 7)
    if (!front1 || !back1 || !front4 || !back4) throw new Error(`The ${flip}-flip card fixture is missing a placement.`)
    const back1Box = textBox(1, 'Back', 1)
    return {
      pages: pdfPages.length,
      paired:
        inside(textBox(0, 'Front', 1), front1.trim) &&
        inside(back1Box, back1.trim) &&
        inside(textBox(0, 'Front', 4), front4.trim) &&
        inside(textBox(1, 'Back', 4), back4.trim),
      moved: !inside(back1Box, front1.trim),
    }
  }
  const longCards = twoSidedTextCheck('pages-two-sided-long', 'long')
  check(
    'long-flip two-sided cards put front and back text in paired trims and not the unmirrored trim',
    longCards.pages === 2 && longCards.paired && longCards.moved,
    JSON.stringify(longCards),
  )
  const shortCards = twoSidedTextCheck('pages-two-sided-short', 'short')
  check(
    'short-flip two-sided cards put back text in the y-mirrored trim',
    shortCards.pages === 2 && shortCards.paired && shortCards.moved,
    JSON.stringify(shortCards),
  )

  const markedInput = Imposition.parse({ ...twoSidedCardImposition, marks: true })
  const markedSides = impositionMarks(markedInput)
  const marksVisible = markedSides.every((side, index) => {
    const raster = rasterPdf(output, work, 'pages-two-sided-marks', index + 1)
    return side.marks.every((mark) => darkestNear(raster, (mark.x1 + mark.x2) / 2, (mark.y1 + mark.y2) / 2) < 245)
  })
  check('imposed crop marks render at their expected positions on both physical sides', marksVisible)

  const oddImposed = impose(Imposition.parse(twoSidedSequenceImposition), 5)
  const oddInfo = imposedInfo('pages-two-sided-odd.pdf')
  const blankBack = rasterPdf(output, work, 'pages-two-sided-odd', oddImposed.papers * 2)
  check(
    'five pages on a two-cell two-sided grid make four PDF pages with a blank last back',
    new RegExp(`Pages:\\s+${oddImposed.papers * 2}\\b`).test(oddInfo) && blankBack.pixels.every((value) => value >= 254),
    oddInfo.match(/Pages:\s+\d+/)?.[0],
  )

  const limits = readFileSync(path.join(output, 'pages-limits.txt'), 'utf8')
  check('the imposed maxSheets ceiling counts PDF pages and names both counts', limits === 'The PDF has 2 sheets; the limit is 1.', limits)

  const letterFolded = impose(Imposition.parse(letterFoldImposition), letterFoldPages.length)
  const letterXml = execFileSync('pdftotext', ['-bbox', path.join(output, 'pages-letter-fold.pdf'), '-'], { encoding: 'utf8' })
  const letterPdfPages = [...letterXml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map((match) => match[1] ?? '')
  const letterWord = (pdfPage: number, label: string) => {
    const words = [...(letterPdfPages[pdfPage] ?? '').matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)<\/word>/g)]
    const word = words.find((entry) => entry[5] === label)
    if (!word) return undefined
    return { xMin: Number(word[1]), yMin: Number(word[2]), xMax: Number(word[3]), yMax: Number(word[4]) }
  }
  const letterInside = (box: ReturnType<typeof letterWord>, trim: { x: number; y: number; width: number; height: number }) =>
    Boolean(
      box &&
        box.xMin >= trim.x / MM_PER_PT - 1 &&
        box.yMin >= trim.y / MM_PER_PT - 1 &&
        box.xMax <= (trim.x + trim.width) / MM_PER_PT + 1 &&
        box.yMax <= (trim.y + trim.height) / MM_PER_PT + 1,
    )
  const letterPlaced = [1, 2, 3, 4, 5, 6].every((label) => {
    const placement = letterFolded.placements.find((entry) => entry.page === label - 1)
    if (!placement) return false
    return letterInside(letterWord(placement.side === 'front' ? 0 : 1, String(label)), placement.trim)
  })
  check(
    'a letter-fold brochure puts every panel in its place on both sides',
    letterPdfPages.length === 2 && letterFolded.placements.length === 6 && letterPlaced,
    `pages=${letterPdfPages.length} placements=${letterFolded.placements.length}`,
  )
}
