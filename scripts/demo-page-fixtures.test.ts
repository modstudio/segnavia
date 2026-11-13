import { expect, test } from 'bun:test'
import { editionWorksheet, worksheetHtml } from './demo-field-fixture.ts'

test('worksheet fixture covers English and Hebrew field forms and converted task items', () => {
  const html = worksheetHtml
  expect(html).toContain('lang="en"')
  expect(html).toContain('lang="he" dir="rtl"')
  expect(html).toContain('data-segnavia-field-length="10ch">ALPHA')
  expect(html).toContain('<figure><span data-segnavia-field="line"></span><figcaption>Figure answer</figcaption></figure>')
  expect(html).toContain('data-segnavia-field-length="8em">תשובה')
  expect(html).toContain('data-segnavia-field-rule="ruled">Written answer')
  expect(html).toContain('data-segnavia-field-rule="plain"')
  expect(html).toContain('aria-label="checked"')
  expect(html).toContain('aria-label="unchecked"')
  expect(html).toContain('<li class="task-list-item"><span data-segnavia-field="checkbox"')
  expect(html).not.toContain('<input')
})

test('edition worksheet covers inline, block, placed and section conditions in English and Hebrew', () => {
  expect(editionWorksheet.editions?.map((edition) => edition.name)).toEqual(['student', 'teacher'])
  expect(JSON.stringify(editionWorksheet)).toContain('data-segnavia-condition')
  expect(JSON.stringify(editionWorksheet)).toContain('"type":"placed"')
  expect(JSON.stringify(editionWorksheet)).toContain('דף עבודה')
})
