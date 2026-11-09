import { expect, test } from 'bun:test'
import { bindRecordValues } from './record-values.ts'

const section = {
  html: '<p data-slot-value="name"></p>',
  values: { name: 'שָׁלוֹם' },
  recordTemplate: { name: 'row', slots: [{ key: 'name' }] },
}

test('binds record text with automatic direction and consumes values', () => {
  expect(bindRecordValues(section)).toEqual({
    html: '<p dir="auto">שָׁלוֹם</p>',
    recordTemplate: section.recordTemplate,
  })
})

test('refuses a declared template slot that its HTML never binds', () => {
  expect(() => bindRecordValues({ ...section, html: '<p></p>' })).toThrow('never binds it')
})
