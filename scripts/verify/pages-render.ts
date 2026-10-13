import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fitPage, Imposition, impose, MM_PER_PT, Page, printBoxes } from '@segnavia/format'
import { containedImposition, coveringImposition, fixedImposedPage, labelsImposition, postcardBackPage, postcardPage } from '../demo-page-fixtures.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

function readPgm(file: string): { width: number; height: number; pixels: Uint8Array } {
  const bytes = readFileSync(file)
  let offset = 0
  const token = () => {
    while (offset < bytes.length) {
      if (bytes[offset] === 35) while (offset < bytes.length && bytes[offset] !== 10) offset++
      else if ((bytes[offset] ?? 0) <= 32) offset++
      else break
    }
    const start = offset
    while (offset < bytes.length && (bytes[offset] ?? 0) > 32) offset++
    return bytes.subarray(start, offset).toString()
  }
  if (token() !== 'P5') throw new Error(`The raster at ${file} is not a raw PGM.`)
  const width = Number(token())
  const height = Number(token())
  if (token() !== '255') throw new Error(`The raster at ${file} is not 8-bit grayscale.`)
  while ((bytes[offset] ?? 0) <= 32) offset++
  return { width, height, pixels: bytes.subarray(offset) }
}

function rasterValue(raster: ReturnType<typeof readPgm>, xMm: number, yMm: number): number {
  const x = Math.round(xMm / MM_PER_PT)
  const y = Math.round(yMm / MM_PER_PT)
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return 255
  return raster.pixels[y * raster.width + x] ?? 255
}

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
    const prefix = path.join(work, file)
    execFileSync('pdftoppm', ['-r', '72', '-gray', '-singlefile', path.join(output, `${file}.pdf`), prefix])
    const raster = readPgm(`${prefix}.pgm`)
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
