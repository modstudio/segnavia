import { expect, test } from 'bun:test'
import { Page } from '@segnavia/format'
import { resolvePageHtml } from '@segnavia/html'
import { expandFramePage } from './motif-expansion.ts'

function placed(foot: string) {
  return Page.parse({
    html: '<p>Body</p>',
    print: { paper: 'a4' },
    printedPages: { parents: [{ name: 'body', regions: { foot: { edge: 'blockEnd', html: foot } } }], parentRules: [{ parent: 'body' }] },
  })
}

test('refuses a reserved library motif placed in a parent page', async () => {
  const source = { motif: async () => undefined }
  await expect(
    expandFramePage(resolvePageHtml(placed('<footer data-motif="segnavia:folio"></footer>')), { source }, new AbortController().signal),
  ).rejects.toThrow('"segnavia:" is reserved for library motifs; rename the motif key to clear this refusal')
})

test('parses an unquoted reserved parent placement without a motif source', async () => {
  await expect(
    expandFramePage(resolvePageHtml(placed('<footer DATA-MOTIF=segnavia:folio></footer>')), undefined, new AbortController().signal),
  ).rejects.toThrow('"segnavia:" is reserved for library motifs; rename the motif key to clear this refusal')
})
