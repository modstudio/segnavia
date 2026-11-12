import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { bookFromDocument, type DocumentInput, PREFLIGHT_PRESETS } from '@segnavia/format'
import { bookValueDocument } from '@segnavia/frame/book-document'
import { newNonce } from '@segnavia/frame/bridge'
import { parseDocument } from '@segnavia/html'
import { writeBookPageLimitDemo } from './build-book-page-limit-demo.ts'
import { fillFixture, refuseOverflowFixture, truncateFixture } from './demo-book-fill-fixtures.ts'

function value(input: DocumentInput) {
  let id = 0
  return bookFromDocument(parseDocument(input, { newId: () => `fill-fixture-${++id}` }))
}

export function writeBookFillDemo(site: string): void {
  writeBookPageLimitDemo(site)
  writeFileSync(path.join(site, 'book-fill-repeat.html'), bookValueDocument(value(fillFixture()), { nonce: newNonce(), profile: PREFLIGHT_PRESETS.default }))
  writeFileSync(
    path.join(site, 'book-fill-truncate.html'),
    bookValueDocument(value(truncateFixture()), { nonce: newNonce(), profile: PREFLIGHT_PRESETS.default }),
  )
  writeFileSync(path.join(site, 'book-fill-refuse.html'), bookValueDocument(value(refuseOverflowFixture()), { nonce: newNonce() }))
}
