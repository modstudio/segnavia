import { readFileSync } from 'node:fs'
import path from 'node:path'
import { type LineNumberGeometry, lineNumberGeometry } from '../demo-book-line-number-fixtures.ts'
import { type Harness, SITE } from './harness.ts'

function geometryDifference(screen: LineNumberGeometry[], pdf: LineNumberGeometry[]) {
  return screen.map((number) => {
    const printed = pdf.find((candidate) => candidate.page === number.page && candidate.value === number.value)
    return {
      page: number.page,
      value: number.value,
      x: printed ? Math.abs(number.x - printed.x) : Number.POSITIVE_INFINITY,
      y: printed ? Math.abs(number.y - printed.y) : Number.POSITIVE_INFINITY,
    }
  })
}

export async function verifyBookLineNumbers(h: Harness) {
  await h.page.goto(h.url('book-line-numbers.html'))
  for (const language of ['en', 'he'] as const) {
    const frame = h.page.frameLocator(`#book-line-numbers-${language} iframe[data-segnavia-book-layout="pages"]`)
    await frame.locator('html[data-segnavia-composed]').waitFor({ timeout: 20_000, state: 'attached' })
    const screen = await frame.locator('html').evaluate(lineNumberGeometry)
    const pdf = JSON.parse(readFileSync(path.join(SITE, `book-line-numbers-${language}-pdf-geometry.json`), 'utf8')) as LineNumberGeometry[]
    const difference = geometryDifference(screen, pdf)
    h.check(
      `book-line-numbers-${language} places every line number at the same unscaled CSS coordinates on screen and in the PDF`,
      screen.length > 0 && screen.length === pdf.length && difference.every((number) => number.x <= 0.5 && number.y <= 0.5),
      JSON.stringify({ screen, pdf, difference }),
    )
  }
}
