import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { PageInput } from '@segnavia/format'
import type { openRenderer } from '@segnavia/render'
import { EXPECTED_MARKER_POSITION, MEASUREMENT_CSS, SCALE } from './config.ts'
import { alignmentOffset, cropImage, glyphLineBoxes, imageSize } from './image.ts'
import { trimPdf } from './pdf.ts'
import { poppler } from './readers.ts'
import type { PosterEvidence } from './types.ts'

type Renderer = Awaited<ReturnType<typeof openRenderer>>

export async function measurePosterLayout(renderer: Renderer, directory: string, poster: PageInput): Promise<PosterEvidence> {
  const evidenceDirectory = path.join(directory, 'poster', 'layout-evidence')
  mkdirSync(evidenceDirectory, { recursive: true })
  const diagnosticCss =
    '<style>body{background:#fff!important}.fade,.art,.ticket,.type p{visibility:hidden!important}.type h1{color:#000!important;text-shadow:none!important}</style>'
  const variants = [
    { id: 'authored', label: 'authored CSS', css: '' },
    { id: 'no-letter-spacing', label: 'letter-spacing removed', css: '<style>.type h1{letter-spacing:normal!important}</style>' },
    { id: 'normal-line-height', label: 'line-height normal', css: '<style>.type h1{line-height:normal!important}</style>' },
  ]
  const results: PosterEvidence['variants'] = []
  for (const variant of variants) {
    const page = { ...poster, html: `${poster.html}${diagnosticCss}${variant.css}` }
    let headline = { x: 0, y: 0, width: 0, height: 0 }
    const screen = path.join(evidenceDirectory, `${variant.id}-screen-page.png`)
    const pdf = path.join(evidenceDirectory, `${variant.id}.pdf`)
    const comparisonPdf = path.join(evidenceDirectory, `${variant.id}-comparison.pdf`)
    const popplerImage = path.join(evidenceDirectory, `${variant.id}-poppler-page.png`)
    await Bun.write(
      screen,
      await renderer.pageImage(page, {
        scale: SCALE,
        css: MEASUREMENT_CSS,
        beforeOutput: async (tab) => {
          headline = await tab.locator('.type h1').evaluate((element) => {
            const box = element.getBoundingClientRect()
            return { x: box.x, y: box.y, width: box.width, height: box.height }
          })
        },
      }),
    )
    await Bun.write(pdf, await renderer.pagePdf(page, { css: MEASUREMENT_CSS }))
    await trimPdf(pdf, comparisonPdf)
    const size = await imageSize(screen)
    const rendered = await poppler(comparisonPdf, popplerImage, size.width, size.height)
    if (!rendered.worked || !rendered.image) throw new Error(`Poster layout evidence did not render in Poppler: ${rendered.error ?? 'unknown error'}`)
    const alignment = alignmentOffset(screen, rendered.image, size.width, size.height, EXPECTED_MARKER_POSITION, EXPECTED_MARKER_POSITION)
    if (!alignment.passed) throw new Error(`Poster layout evidence registration failed: ${alignment.error}`)
    const padding = 24 * SCALE
    const left = Math.max(0, headline.x * SCALE - padding)
    const top = Math.max(0, headline.y * SCALE - padding)
    const crop = {
      x: left,
      y: top,
      width: Math.min(size.width, (headline.x + headline.width) * SCALE + padding) - left,
      height: Math.min(size.height, (headline.y + headline.height) * SCALE + padding) - top,
    }
    const screenCrop = path.join(evidenceDirectory, `${variant.id}-screen-headline.png`)
    const popplerCrop = path.join(evidenceDirectory, `${variant.id}-poppler-headline.png`)
    cropImage(screen, screenCrop, crop)
    cropImage(rendered.image, popplerCrop, crop)
    const cropSize = await imageSize(screenCrop)
    const screenLines = glyphLineBoxes(screenCrop, cropSize.width, cropSize.height)
    const popplerLines = glyphLineBoxes(popplerCrop, cropSize.width, cropSize.height)
    if (screenLines.length !== 3 || popplerLines.length !== 3) {
      throw new Error(`${variant.id} poster evidence found ${screenLines.length} screen lines and ${popplerLines.length} Poppler lines; expected 3 each.`)
    }
    results.push({
      variant: variant.label,
      screenCrop,
      popplerCrop,
      alignment,
      lines: screenLines.map((screenBox, index) => {
        const popplerBox = popplerLines[index] as (typeof popplerLines)[number]
        return {
          line: index + 1,
          screen: screenBox,
          poppler: popplerBox,
          displacementX: popplerBox.x - screenBox.x,
          displacementY: popplerBox.y - screenBox.y,
          widthChange: popplerBox.width - screenBox.width,
          heightChange: popplerBox.height - screenBox.height,
        }
      }),
    })
  }
  const authored = results[0]?.lines ?? []
  const withoutSpacing = results[1]?.lines ?? []
  const normalLineHeight = results[2]?.lines ?? []
  const sameDisplacement = (left: typeof authored, right: typeof authored, axis: 'displacementX' | 'displacementY') =>
    left.every((line, index) => Math.abs(line[axis] - (right[index]?.[axis] ?? Number.POSITIVE_INFINITY)) <= 1)
  const spacingFinding = sameDisplacement(authored, withoutSpacing, 'displacementX')
    ? 'Removing letter-spacing preserves the horizontal displacement.'
    : 'Removing letter-spacing changes the horizontal displacement.'
  const lineHeightFinding = sameDisplacement(authored, normalLineHeight, 'displacementY')
    ? 'Normal line-height preserves the vertical displacement.'
    : 'Normal line-height changes the vertical displacement.'
  const authoredX = authored.map((line) => line.displacementX).join(', ')
  const authoredY = authored.map((line) => line.displacementY).join(', ')
  const marker = results[0]?.alignment
  return {
    method:
      'An in-memory copy isolates the black headline on white, removes its shadow, and keeps the fixed page marker. Screen and Poppler crops use identical page coordinates after marker registration; dark-pixel glyph bounds are measured for each line.',
    variants: results,
    conclusion: `The fixed marker is displaced ${marker?.offsetX ?? '—'}, ${marker?.offsetY ?? '—'} device px while the authored glyph boxes are displaced horizontally ${authoredX} and vertically ${authoredY} device px, so page crop or registration does not explain the headline difference. ${spacingFinding} ${lineHeightFinding} Neither scratch change removes the difference; the evidence supports Chromium screen-versus-print text metrics or layout as the cause, but does not isolate one authored property.`,
  }
}
