import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { openRenderer } from '@segnavia/render'
import { readProfile } from '../../packages/render/src/color/index.ts'
import { ENGLISH_BOOK_ID, FAULT_CONTROL_PAGE, HEBREW_BOOK_ID, SHIFTED_BOOK_ID, bookFixtures } from './book-fixtures.ts'
import { measureBookPages } from './book-run.ts'
import { shiftTextWindowByOneLine } from './book-screen.ts'
import { bookPagesPass, faultControlFailure } from './book-verdict.ts'
import { chromiumPath } from './config.ts'
import { proofTable } from './image.ts'
import type { FidelitySession } from './measure-document.ts'
import { pressRasterizer } from './readers.ts'
import type { DocumentResult } from './types.ts'

const which = (process.argv[2] ?? 'en') as 'en' | 'he' | 'fault'
const outRoot = process.env.SEGNAVIA_FIDELITY_MEASURE_OUT ?? path.resolve(import.meta.dir, '../../out/fidelity-measure')
const directory = path.join(outRoot, which)
mkdirSync(directory, { recursive: true })

const defaultGrayProfile = '/System/Library/ColorSync/Profiles/Generic Gray Gamma 2.2 Profile.icc'
const profilePath = process.env.SEGNAVIA_FIDELITY_PROFILE
const profileBytes = profilePath ? new Uint8Array(readFileSync(profilePath)) : undefined
const profile = profileBytes ? readProfile(profileBytes) : undefined
const table = profileBytes ? proofTable(profileBytes) : undefined
const grayProfilePath = process.env.SEGNAVIA_FIDELITY_GRAY_PROFILE ?? (existsSync(defaultGrayProfile) ? defaultGrayProfile : undefined)
const grayProfileBytes = grayProfilePath ? new Uint8Array(readFileSync(grayProfilePath)) : undefined
const grayTable = grayProfileBytes ? proofTable(grayProfileBytes) : undefined
const executablePath = chromiumPath()
const renderer = await openRenderer({ executablePath, concurrency: 1 })
const session: FidelitySession = {
  renderer,
  executablePath,
  profilePath,
  profileBytes,
  profile,
  table,
  grayProfilePath,
  grayProfileBytes,
  grayTable,
  selectedPressRasterizer: pressRasterizer(),
  defaultGrayProfile,
}

function fmt(value: { mean: number; p99: number } | undefined, missing?: string): string {
  return value ? `mean ${value.mean.toFixed(4)} p99 ${value.p99}` : `SKIP ${missing ?? 'not measured'}`
}

function printPage(page: DocumentResult): void {
  console.log(`== ${page.id}${page.faultControl ? ' FAULT' : ''}`)
  for (const reader of page.readers) {
    if (reader.worked) {
      const align = reader.alignment ? ` align ${reader.alignment.offsetX},${reader.alignment.offsetY}` : ''
      console.log(`reader ${reader.reader} (${reader.engine}): ${fmt(reader.page)}${align}`)
    } else {
      console.log(`reader ${reader.reader} (${reader.engine}): SKIP ${reader.error ?? 'not run'}`)
    }
  }
  console.log(`press: ${fmt(page.pressDifference, page.pressReason)} passed=${String(page.bars.pressColor.passed)}`)
  console.log(
    `gray: ${fmt(page.grayPressDifference, page.grayPressReason)} residues=${String(page.grayPressResidues ?? '—')} passed=${String(page.bars.grayPressColor.passed)}`,
  )
  console.log(
    `bars: effects=${page.bars.effects.passed ? 'PASS' : 'FAIL'} press=${page.bars.pressColor.passed ? 'PASS' : 'FAIL'} gray=${page.bars.grayPressColor.passed ? 'PASS' : 'FAIL'} size=${page.bars.size.passed ? 'PASS' : 'FAIL'}`,
  )
}

function rgb(file: string, width: number, height: number): Uint8Array {
  const result = Bun.spawnSync(
    ['ffmpeg', '-loglevel', 'error', '-i', file, '-vf', `scale=${width}:${height}:flags=lanczos`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { stdout: 'pipe', stderr: 'pipe' },
  )
  if (result.exitCode !== 0) throw new Error(`ffmpeg failed for ${file}: ${result.stderr.toString().trim()}`)
  return result.stdout
}

function rowInk(pixels: Uint8Array, width: number, height: number): Float64Array {
  const ink = new Float64Array(height)
  for (let y = 0; y < height; y++) {
    let sum = 0
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3
      sum += 765 - (pixels[offset] ?? 0) - (pixels[offset + 1] ?? 0) - (pixels[offset + 2] ?? 0)
    }
    ink[y] = sum
  }
  return ink
}

function bandOffsets(left: Float64Array, right: Float64Array, height: number): Array<{ top: number; bottom: number; dy: number; sad: number }> {
  const band = 200
  const bands: Array<{ top: number; bottom: number; dy: number; sad: number }> = []
  for (let top = 0; top < height; top += band) {
    const bottom = Math.min(height, top + band)
    let bestDy = 0
    let bestSad = Number.POSITIVE_INFINITY
    for (let dy = -12; dy <= 12; dy++) {
      let sad = 0
      let count = 0
      for (let y = top; y < bottom; y++) {
        const other = y + dy
        if (other < 0 || other >= height) continue
        sad += Math.abs((left[y] ?? 0) - (right[other] ?? 0))
        count++
      }
      const score = count ? sad / count : Number.POSITIVE_INFINITY
      if (score < bestSad) {
        bestSad = score
        bestDy = dy
      }
    }
    bands.push({ top, bottom, dy: bestDy, sad: bestSad })
  }
  return bands
}

function reportBands(page: DocumentResult): void {
  const pairs: Array<[string, string | undefined, string | undefined]> = [
    ['press', page.pressProof, page.pressRaster],
    ['gray', page.grayPressProof, page.grayPressRaster],
    ...page.readers.map((reader): [string, string | undefined, string | undefined] => [reader.reader, page.screen, reader.image]),
  ]
  console.log(`-- band offsets for ${page.id} (${page.width}x${page.height}, 200-row bands, dy -12..12)`)
  for (const [label, leftFile, rightFile] of pairs) {
    if (!leftFile || !rightFile || !existsSync(leftFile) || !existsSync(rightFile)) {
      console.log(`band ${label}: missing rasters`)
      continue
    }
    const left = rowInk(rgb(leftFile, page.width, page.height), page.width, page.height)
    const right = rowInk(rgb(rightFile, page.width, page.height), page.width, page.height)
    const bands = bandOffsets(left, right, page.height)
    console.log(`band ${label}: ${bands.map((band) => `${band.top}-${band.bottom}:dy=${band.dy}`).join(' ')}`)
  }
}

try {
  const fixtures = await bookFixtures()
  const wanted = which === 'he' ? HEBREW_BOOK_ID : ENGLISH_BOOK_ID
  const fixture = fixtures.find((entry) => entry.id === wanted)
  if (!fixture) throw new Error(`Missing fixture ${wanted}`)
  console.log(`chromium ${executablePath}`)
  console.log(`profile ${profilePath ?? 'unset'} gray ${grayProfilePath ?? 'unset'}`)
  console.log(`out ${directory}`)
  if (which === 'fault') {
    console.log('Rendering English control book fault control')
    const shifted = await measureBookPages(
      session,
      directory,
      { ...fixture, id: SHIFTED_BOOK_ID, title: `${fixture.title} shifted` },
      {
        faultControl: true,
        pages: [FAULT_CONTROL_PAGE],
        beforeOutput: (tab) => shiftTextWindowByOneLine(tab, FAULT_CONTROL_PAGE),
      },
    )
    const fault = shifted[0]
    if (!fault) throw new Error(`The fault control has no page ${FAULT_CONTROL_PAGE}.`)
    printPage(fault)
    const proof = faultControlFailure(fault)
    console.log(`fault control: ${proof ?? 'FAIL (as required)'}`)
    await Bun.write(path.join(directory, 'result.json'), `${JSON.stringify({ which, fault }, null, 2)}\n`)
  } else {
  console.log(`Rendering ${fixture.title}`)
  const pages = await measureBookPages(session, directory, fixture)
  for (const page of pages) printPage(page)
  const unshiftedPass = bookPagesPass(pages)
  console.log(`unshifted ${fixture.id}: ${unshiftedPass ? 'PASS' : 'FAIL'}`)
  if (!unshiftedPass) {
    const failed = pages.find((page) => !page.bars.pressColor.passed || !page.bars.grayPressColor.passed) ?? pages[0]
    if (failed) reportBands(failed)
    await Bun.write(path.join(directory, 'result.json'), `${JSON.stringify({ which, unshiftedPass, pages }, null, 2)}\n`)
    process.exitCode = 2
  } else if (which === 'en') {
    console.log('Rendering English control book fault control')
    const shifted = await measureBookPages(
      session,
      directory,
      { ...fixture, id: SHIFTED_BOOK_ID, title: `${fixture.title} shifted` },
      {
        faultControl: true,
        pages: [FAULT_CONTROL_PAGE],
        beforeOutput: (tab) => shiftTextWindowByOneLine(tab, FAULT_CONTROL_PAGE),
      },
    )
    const fault = shifted[0]
    if (!fault) throw new Error(`The fault control has no page ${FAULT_CONTROL_PAGE}.`)
    printPage(fault)
    const proof = faultControlFailure(fault)
    console.log(`fault control: ${proof ?? 'FAIL (as required)'}`)
    await Bun.write(path.join(directory, 'result.json'), `${JSON.stringify({ which, unshiftedPass, pages, fault }, null, 2)}\n`)
  } else {
    await Bun.write(path.join(directory, 'result.json'), `${JSON.stringify({ which, unshiftedPass, pages }, null, 2)}\n`)
  }
  }
} finally {
  await renderer.close()
}
