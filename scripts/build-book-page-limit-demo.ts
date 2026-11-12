import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { bookFromDocument } from '@segnavia/format'
import { bookValueDocument } from '@segnavia/frame/book-document'
import { newNonce } from '@segnavia/frame/bridge'
import { parseDocument } from '@segnavia/html'
import { pageLimit583Fixture } from './demo-book-basic-fixtures.ts'

export function writeBookPageLimitDemo(site: string): void {
  const pageLimit583 = bookFromDocument(parseDocument(pageLimit583Fixture()))
  writeFileSync(path.join(site, 'book-page-limit-583-default.html'), bookValueDocument(pageLimit583, { nonce: newNonce(), limits: { pages: 500 } }))
  writeFileSync(path.join(site, 'book-page-limit-583-raised.html'), bookValueDocument(pageLimit583, { nonce: newNonce(), limits: { pages: 600 } }))
}
