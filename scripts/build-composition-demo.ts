import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { bookFromDocument } from '@segnavia/format'
import { bookView, parseDocument } from '@segnavia/html'
import { fixtureIds } from './build-book-fixture-ids.ts'
import { buildIdmlTableDemo } from './demo-idml-table.ts'
import { bookFixtures } from './fidelity/book-fixtures.ts'

async function buildCompositionDemo(site: string): Promise<void> {
  for (const fixture of await bookFixtures()) {
    const book = bookFromDocument(parseDocument(fixture.book, { newId: fixtureIds() }))
    writeFileSync(path.join(site, `${fixture.id}-composition.json`), JSON.stringify(bookView(book)))
  }
  writeFileSync(
    path.join(site, 'book-composition.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Composed control books</title><style>
      html,body{margin:0}body{display:grid;grid-template-columns:1fr 1fr;gap:16px}segnavia-book{display:block;block-size:70vh}
    </style></head><body><segnavia-book id="composition-book-en" src="control-book-en-composition.json"></segnavia-book><segnavia-book id="composition-book-he" src="control-book-he-composition.json"></segnavia-book><script type="module" src="segnavia.js"></script></body></html>`,
  )
}

export async function buildBookSupportDemos(site: string): Promise<void> {
  await Promise.all([buildIdmlTableDemo(site), buildCompositionDemo(site)])
}
