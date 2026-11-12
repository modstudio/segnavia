import { expect, test } from 'bun:test'
import { type DocumentInput, PREFLIGHT_PRESETS } from '@segnavia/format'
import { printedPageDocument } from './printed-page-document.ts'

const fixture: DocumentInput = {
  type: 'document',
  kind: 'printed',
  print: { paper: 'a4' },
  parentPages: [
    {
      type: 'parentPage',
      name: 'body',
      geometry: { margin: { blockStart: 20, blockEnd: 20, inlineStart: 20, inlineEnd: 20 } },
    },
  ],
  parentRules: [{ parent: 'body' }],
  children: [{ type: 'page', body: { html: '<p>Body</p>' } }],
}

test('printed pages default overflow refusal on and only explicit overset off disables it', () => {
  const enabled = printedPageDocument(fixture, { nonce: 'held' })
  const disabled = printedPageDocument(fixture, { nonce: 'held', profile: { ...PREFLIGHT_PRESETS.default, 'region-overset': 'off' } })
  expect(enabled).toContain('"overflowRefusal":true')
  expect(disabled).toContain('"overflowRefusal":false')
})
