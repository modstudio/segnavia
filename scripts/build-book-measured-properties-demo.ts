import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { bookFromDocument } from '@segnavia/format'
import { bookValueDocument as paginatedBookDocument } from '@segnavia/frame/book-document'
import { newNonce } from '@segnavia/frame/bridge'
import { parseDocument } from '@segnavia/html'
import { measuredPropertiesFixture } from './demo-book-measured-properties-fixture.ts'

export function writeBookMeasuredPropertiesDemo(site: string, fontCss: string): void {
  let id = 0
  const book = bookFromDocument(parseDocument(measuredPropertiesFixture(), { newId: () => `measured-property-fixture-${++id}` }))
  writeFileSync(path.join(site, 'book-measured-properties-inner.html'), paginatedBookDocument(book, { nonce: newNonce(), css: fontCss }))
  writeFileSync(
    path.join(site, 'book-measured-properties.html'),
    '<!doctype html><html><head><meta charset="utf-8"><title>Measured properties</title><style>iframe{inline-size:700px;block-size:700px;border:0}</style></head><body><iframe id="measured-properties" sandbox="allow-scripts" src="book-measured-properties-inner.html"></iframe></body></html>',
  )
}
