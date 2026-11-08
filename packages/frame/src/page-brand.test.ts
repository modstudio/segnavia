import { expect, test } from 'bun:test'
import { Document, type pageFromDocument, type StyleSheet } from '@segnavia/format'
import { loadBrandedPage } from './page-brand.ts'

function page(brand: string | undefined, html: string) {
  return Document.parse({
    type: 'document',
    kind: 'page',
    ...(brand === undefined ? {} : { brand }),
    children: [{ type: 'page', body: { html } }],
  })
}

test('a superseded brand resolution neither loads nor reports after the current page', async () => {
  let resolve!: (brand: StyleSheet | undefined) => void
  const pending = new Promise<StyleSheet | undefined>((done) => {
    resolve = done
  })
  const first = new AbortController()
  const second = new AbortController()
  const loaded: string[] = []
  const errors: unknown[] = []
  const host = new EventTarget()
  host.addEventListener('error', (event) => errors.push((event as ErrorEvent).error))

  const record = (value: ReturnType<typeof pageFromDocument>) => loaded.push(value.body && 'html' in value.body ? value.body.html : '')
  loadBrandedPage(page('slow', '<p>First</p>'), { source: { brand: () => pending } }, first.signal, record, host)
  first.abort()
  loadBrandedPage(page(undefined, '<p>Second</p>'), undefined, second.signal, record, host)
  resolve({ css: '.slow{color:red}' })
  await pending
  await Promise.resolve()

  expect(loaded).toEqual(['<p>Second</p>'])
  expect(errors).toHaveLength(0)
})
