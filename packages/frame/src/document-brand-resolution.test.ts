import { expect, test } from 'bun:test'
import { Document } from '@segnavia/format'
import { DocumentBrandLoader } from './document-brand-resolution.ts'

test('a document brand load clears stale pages before awaiting the brand', async () => {
  const document = Document.parse({
    type: 'document',
    kind: 'page',
    brand: 'house',
    children: [{ type: 'page', body: { html: '<p>New</p>' } }],
  })
  const documents = [document]
  let visible = ['old']
  let releaseBrand: (() => void) | undefined
  const loader = new DocumentBrandLoader(
    () => documents,
    () => {
      visible = []
    },
    (_sources, pages) => {
      visible = pages.map((page) => page.html)
    },
    (error) => {
      throw error
    },
  )

  loader.resolve(
    documents,
    {
      source: {
        brand: () =>
          new Promise((resolve) => {
            releaseBrand = () => resolve({ css: '.house{}' })
          }),
      },
    },
    [],
  )

  expect(visible).toEqual([])
  releaseBrand?.()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(visible[0]).toContain('New')
})
