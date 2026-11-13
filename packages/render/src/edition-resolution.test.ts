import { expect, test } from 'bun:test'
import type { DocumentInput } from '@segnavia/format'
import { resolveRenderBook } from './brand.ts'
import type { ParsedPageRenderOptions } from './options.ts'
import { prepareRenderedPage } from './page-document.ts'

const editions = {
  conditions: [{ type: 'condition' as const, name: 'teacher' }],
  editions: [
    { type: 'edition' as const, name: 'student', conditions: [] },
    { type: 'edition' as const, name: 'teacher', conditions: ['teacher'] },
  ],
  defaultEdition: 'student',
}

const worksheetHtml = '<p>Capital of France:<span data-segnavia-condition="teacher"> Paris</span></p>'

const editionWorksheet: DocumentInput = {
  type: 'document',
  kind: 'book',
  title: 'Worksheet',
  mode: 'continuous',
  ...editions,
  children: [{ type: 'section', title: 'Questions', children: [{ type: 'flow', html: worksheetHtml }] }],
}

const worksheetPage: DocumentInput = {
  type: 'document',
  kind: 'page',
  ...editions,
  children: [{ type: 'page', body: { html: worksheetHtml } }],
}

test('render preparation applies student and teacher editions to books and pages', async () => {
  const signal = new AbortController().signal
  const text = (value: unknown) => JSON.stringify(value)
  const studentBook = await resolveRenderBook(editionWorksheet, undefined, undefined, signal, 'student')
  const teacherBook = await resolveRenderBook(editionWorksheet, undefined, undefined, signal, 'teacher')
  expect(text(studentBook)).not.toContain('Paris')
  expect(text(teacherBook)).toContain('Paris')

  const page = async (edition: 'student' | 'teacher') => prepareRenderedPage(worksheetPage, { edition } as ParsedPageRenderOptions, undefined, signal, 'screen')
  expect(text(await page('student'))).not.toContain('Paris')
  expect(text(await page('teacher'))).toContain('Paris')
})
