import { expect, test } from 'bun:test'
import {
  PRINTED_PAGE_DOCUMENT_NUMBER_PATH,
  PRINTED_PAGE_DOCUMENT_TOTAL_PATH,
  PRINTED_PAGE_NUMBER_PATH,
  PRINTED_PAGE_TOTAL_PATH,
  RECORD_COUNT_PATH,
  RECORD_INDEX_PATH,
} from '@segnavia/format'
import { COMPOSER_FURNITURE_PATHS, composerFurnitureValues } from './composer-dress.ts'

const plan = {
  folios: ['1', '1'],
  total: '2',
  documentFolios: ['1', '2'],
  documentTotal: '2',
  recordTotals: { record: '1' },
  records: { record: { index: '1', count: '1' } },
}

test('uses record totals and values on a record page', () => {
  expect(composerFurnitureValues(plan, 'record', 0, COMPOSER_FURNITURE_PATHS)).toMatchObject({
    [PRINTED_PAGE_NUMBER_PATH]: '1',
    [PRINTED_PAGE_TOTAL_PATH]: '1',
    [PRINTED_PAGE_DOCUMENT_NUMBER_PATH]: '1',
    [PRINTED_PAGE_DOCUMENT_TOTAL_PATH]: '2',
    [RECORD_INDEX_PATH]: '1',
    [RECORD_COUNT_PATH]: '1',
  })
})

test('uses plan total and empty record text outside records', () => {
  expect(composerFurnitureValues(plan, 'ordinary', 1, COMPOSER_FURNITURE_PATHS)).toMatchObject({
    [PRINTED_PAGE_TOTAL_PATH]: '2',
    [RECORD_INDEX_PATH]: '',
    [RECORD_COUNT_PATH]: '',
  })
})

test('takes every furniture path from the format constants', () => {
  expect(COMPOSER_FURNITURE_PATHS).toEqual({
    number: PRINTED_PAGE_NUMBER_PATH,
    total: PRINTED_PAGE_TOTAL_PATH,
    documentNumber: PRINTED_PAGE_DOCUMENT_NUMBER_PATH,
    documentTotal: PRINTED_PAGE_DOCUMENT_TOTAL_PATH,
    recordIndex: RECORD_INDEX_PATH,
    recordCount: RECORD_COUNT_PATH,
  })
})
