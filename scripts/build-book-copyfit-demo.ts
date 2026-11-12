import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { bookFromDocument, type DocumentInput, PREFLIGHT_PRESETS } from '@segnavia/format'
import { bookValueDocument as paginatedBookDocument } from '@segnavia/frame/book-document'
import { newNonce } from '@segnavia/frame/bridge'
import { parseDocument } from '@segnavia/html'
import { filledBook } from '@segnavia/render'
import { fitLimitFixture, groupCopyfitFixture, pageCountCopyfitFixture, slotCopyfitFixture } from './demo-book-copyfit-fixtures.ts'

function fixtureValue(input: DocumentInput) {
  let id = 0
  return bookFromDocument(parseDocument(input, { newId: () => `copyfit-fixture-${++id}` }))
}

export async function writeBookCopyfitDemo(site: string): Promise<void> {
  const documents = [
    ['book-copyfit-group.html', groupCopyfitFixture(), PREFLIGHT_PRESETS.default],
    ['book-copyfit-page-count-fitted.html', pageCountCopyfitFixture(true), PREFLIGHT_PRESETS.default],
    ['book-copyfit-page-count-authored.html', pageCountCopyfitFixture(false), PREFLIGHT_PRESETS.default],
    ['book-copyfit-limit-default.html', fitLimitFixture(), PREFLIGHT_PRESETS.default],
    ['book-copyfit-limit-strict.html', fitLimitFixture(), PREFLIGHT_PRESETS.strict],
  ] as const
  for (const [name, fixture, profile] of documents) {
    writeFileSync(path.join(site, name), paginatedBookDocument(fixtureValue(fixture), { nonce: newNonce(), profile }))
  }
  const { value: slotCopyfit } = await filledBook(fixtureValue(slotCopyfitFixture()), {
    fill: { id: 'copyfit', values: { name: 'Alexandria Montgomery-Worthington' } },
  })
  writeFileSync(path.join(site, 'book-copyfit-slot.html'), paginatedBookDocument(slotCopyfit, { nonce: newNonce(), profile: PREFLIGHT_PRESETS.default }))
  writeFileSync(
    path.join(site, 'book-copyfit.html'),
    `<!doctype html><html><head><meta charset="utf-8"><title>Book copyfit</title><style>iframe{inline-size:600px;block-size:500px;border:0}</style></head><body>${[
      'slot',
      'group',
      'page-count-fitted',
      'page-count-authored',
      'limit-default',
      'limit-strict',
    ]
      .map((name) => `<iframe id="copyfit-${name}" sandbox="allow-scripts" src="book-copyfit-${name}.html"></iframe>`)
      .join('')}</body></html>`,
  )
}
