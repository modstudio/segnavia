import { execFileSync } from 'node:child_process'
import path from 'node:path'

type Check = (what: string, ok: boolean, detail?: string) => void

export function verifySectionedRender(output: string, check: Check): void {
  const sectioned = execFileSync('pdftotext', ['-layout', path.join(output, 'pages-sectioned.pdf'), '-'], { encoding: 'utf8' })
    .split('\f')
    .filter(Boolean)
  check(
    'a sectioned printed document has an uncounted cover and two numbered body papers',
    sectioned.length === 3 &&
      sectioned[0]?.includes('SECTIONED COVER') === true &&
      sectioned[0]?.includes('Page') === false &&
      sectioned[0]?.includes('of') === false &&
      sectioned[1]?.includes('Page 1 of 2') === true &&
      sectioned[2]?.includes('Page 2 of 2') === true,
    sectioned.map((text, index) => `${index + 1}:${text.replace(/\s+/g, ' ').trim()}`).join(' | '),
  )
  const pagePdf = execFileSync('pdfinfo', [path.join(output, 'pages-sectioned.pdf')], { encoding: 'utf8' })
  const pagesPdf = execFileSync('pdfinfo', [path.join(output, 'pages-sectioned-multi.pdf')], { encoding: 'utf8' })
  check('pagesPdf prints the sectioned fixture with the same paper count as pagePdf', /Pages:\s+3\b/.test(pagePdf) && /Pages:\s+3\b/.test(pagesPdf))

  const pressInfo = execFileSync('pdfinfo', ['-box', '-f', '1', '-l', '3', path.join(output, 'pages-sectioned-press.pdf')], { encoding: 'utf8' })
  const pt = (millimeters: number) => (millimeters * 72) / 25.4
  const pressBoxes = (name: string) =>
    [...pressInfo.matchAll(new RegExp(`Page\\s+\\d+\\s+${name}:\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)`, 'g'))].map((match) =>
      match.slice(1).map(Number),
    )
  const close = (actual: number[] | undefined, expected: number[]) =>
    actual?.every((value, index) => Math.abs(value - (expected[index] ?? Number.NaN)) < 0.1) ?? false
  const expectedPress = {
    media: [0, 0, pt(233.9), pt(297.4)],
    bleed: [pt(6), pt(6), pt(227.9), pt(291.4)],
    trim: [pt(9), pt(9), pt(224.9), pt(288.4)],
  }
  const pressMedia = pressBoxes('MediaBox')
  const pressBleed = pressBoxes('BleedBox')
  const pressTrim = pressBoxes('TrimBox')
  check(
    'unnamed section papers receive the document press settings per page',
    pressMedia.length === 3 &&
      pressMedia.every((box) => close(box, expectedPress.media)) &&
      pressBleed.every((box) => close(box, expectedPress.bleed)) &&
      pressTrim.every((box) => close(box, expectedPress.trim)),
    JSON.stringify({ media: pressMedia, bleed: pressBleed, trim: pressTrim }),
  )

  const mixedPath = path.join(output, 'pages-mixed-paper.pdf')
  const mixedInfo = execFileSync('pdfinfo', ['-box', '-f', '1', '-l', '4', mixedPath], { encoding: 'utf8' })
  const boxes = [...mixedInfo.matchAll(/Page\s+\d+\s+MediaBox:\s+0\.00\s+0\.00\s+([\d.]+)\s+([\d.]+)/g)].map((match) => match.slice(1).map(Number))
  check(
    'designed and flowing sections print on their A4 portrait, A4 landscape, Letter, and landscape papers in author order',
    close(boxes[0], [595.28, 841.89]) && close(boxes[1], [841.89, 595.28]) && close(boxes[2], [612, 792]) && close(boxes[3], [841.89, 595.28]),
    JSON.stringify(boxes),
  )
  const mixedText = execFileSync('pdftotext', ['-layout', mixedPath, '-'], { encoding: 'utf8' })
  check('the flowing landscape section renders its body on the landscape paper', mixedText.includes('LANDSCAPE FLOW'))

  const bleedInfo = execFileSync('pdfinfo', ['-box', '-f', '1', '-l', '3', path.join(output, 'pages-mixed-paper-bleed.pdf')], { encoding: 'utf8' })
  const pageBoxes = (name: string) =>
    [...bleedInfo.matchAll(new RegExp(`Page\\s+\\d+\\s+${name}:\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)`, 'g'))].map((match) =>
      match.slice(1).map(Number),
    )
  const expected = [
    { media: [0, 0, pt(228), pt(315)], bleed: [pt(6), pt(6), pt(222), pt(309)], trim: [pt(9), pt(9), pt(219), pt(306)] },
    { media: [0, 0, pt(315), pt(228)], bleed: [pt(6), pt(6), pt(309), pt(222)], trim: [pt(9), pt(9), pt(306), pt(219)] },
    { media: [0, 0, pt(233.9), pt(297.4)], bleed: [pt(6), pt(6), pt(227.9), pt(291.4)], trim: [pt(9), pt(9), pt(224.9), pt(288.4)] },
  ]
  const media = pageBoxes('MediaBox')
  const bleed = pageBoxes('BleedBox')
  const trim = pageBoxes('TrimBox')
  check(
    'mixed-paper bleed prints each page with its own media, bleed and trim boxes',
    expected.every((boxes, index) => close(media[index], boxes.media) && close(bleed[index], boxes.bleed) && close(trim[index], boxes.trim)),
    JSON.stringify({ media, bleed, trim }),
  )
}
