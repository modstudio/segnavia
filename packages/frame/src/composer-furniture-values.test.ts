import { expect, test } from 'bun:test'
import { composerFurnitureValues } from './composer-dress.ts'

const plan = {
  folios: ['1', '1'],
  total: '2',
  documentFolios: ['1', '2'],
  documentTotal: '2',
  recordTotals: { record: '1' },
  records: { record: { index: '1', count: '1' } },
}

test('uses record totals and values on a record page', () => {
  expect(composerFurnitureValues(plan, 'record', 0)).toMatchObject({
    'printedPage.number': '1',
    'printedPage.total': '1',
    'printedPage.documentNumber': '1',
    'printedPage.documentTotal': '2',
    'record.index': '1',
    'record.count': '1',
  })
})

test('uses plan total and empty record text outside records', () => {
  expect(composerFurnitureValues(plan, 'ordinary', 1)).toMatchObject({ 'printedPage.total': '2', 'record.index': '', 'record.count': '' })
})
