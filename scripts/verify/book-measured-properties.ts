import { MEASURE_COLUMN_UNIT } from '../demo-book-measured-properties-fixture.ts'
import type { Harness } from './harness.ts'

export async function verifyBookMeasuredProperties(h: Harness): Promise<void> {
  await h.page.goto(h.url('book-measured-properties.html'))
  const frame = h.page.frameLocator('#measured-properties')
  await frame.locator('[data-segnavia-pages]').waitFor()
  const report = await frame.locator('body').evaluate(() => {
    const source = (id: string) => document.querySelector<HTMLElement>(`[data-segnavia-galley-source] [data-segnavia-id="${id}"]`)
    const property = (id: string, name: string) => source(id)?.style.getPropertyValue(name) ?? ''
    const count = (id: string) => Number.parseInt(getComputedStyle(source(id)?.querySelector('.derived-columns') as Element).columnCount, 10)
    const widest = Number.parseFloat(property('wide-words', '--widest'))
    const narrowest = Number.parseFloat(property('narrow-words', '--widest'))
    const fitted = source('fitted-lines')
    const range = document.createRange()
    if (fitted) range.selectNodeContents(fitted)
    const lineTops: number[] = []
    for (const rect of fitted ? range.getClientRects() : []) if (!lineTops.some((top) => Math.abs(top - rect.top) < 0.5)) lineTops.push(rect.top)
    const copies = Array.from(document.querySelectorAll<HTMLElement>('[data-segnavia-pages] [data-segnavia-id="flowing-measure"]'))
    return {
      wide: { value: widest, columns: count('wide-words') },
      narrow: { value: narrowest, columns: count('narrow-words') },
      hebrew: {
        pointed: Number.parseFloat(property('pointed-word', '--word-width')),
        plain: Number.parseFloat(property('plain-word', '--word-width')),
      },
      fitted: {
        size: fitted ? Number.parseFloat(getComputedStyle(fitted).fontSize) : 0,
        property: Number.parseInt(property('fitted-lines', '--fitted-lines'), 10),
        actual: lineTops.length,
      },
      template: property('template-measure', '--template-width'),
      copies: copies.map((copy) => copy.style.getPropertyValue('--flow-block')),
    }
  })
  const implied = (value: number) => Math.max(1, Math.min(4, Math.floor(value / MEASURE_COLUMN_UNIT)))
  h.check(
    'the column-count recipe yields the count implied by the widest child and changes when that child changes',
    report.wide.columns === implied(report.wide.value) &&
      report.narrow.columns === implied(report.narrow.value) &&
      report.wide.value > report.narrow.value &&
      report.wide.columns > report.narrow.columns,
    JSON.stringify({ wide: report.wide, narrow: report.narrow }),
  )
  h.check(
    'a template-region source carries the property measured on its staged clone',
    Number.parseFloat(report.template) > 0,
    JSON.stringify({ value: report.template }),
  )
  h.check(
    'line-count is measured after copyfit and equals the fitted source lines',
    report.fitted.size < 28 && report.fitted.property === report.fitted.actual && report.fitted.actual > 0,
    JSON.stringify(report.fitted),
  )
  const hebrewDifference = Math.abs(report.hebrew.pointed - report.hebrew.plain)
  h.check(
    'a pointed Hebrew word and the same unpointed letters measure within 0.5px',
    hebrewDifference <= 0.5,
    JSON.stringify({ ...report.hebrew, difference: hebrewDifference }),
  )
  h.check(
    'every dressed page copy carries the measured source property',
    report.copies.length > 1 && report.copies.every((value) => value !== '' && value === report.copies[0]),
    JSON.stringify(report.copies),
  )
}
