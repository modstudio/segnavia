import { expect, test } from 'bun:test'
import type { HtmlPage } from '@segnavia/html'
import { prepareShownPage } from './motif-expansion.ts'
import { SlotFillRefusedError } from './slot-render.ts'

test('a scripted slot fill refuses before an unresolved declared font', async () => {
  const page: HtmlPage = {
    html: '<p data-slot-value="name">Authored</p>',
    scripts: 'sandboxed',
    slots: [{ key: 'name', label: 'Name', type: 'text' }],
    style: { fonts: { missing: { faces: [{}] } } },
  }
  const signal = new AbortController().signal
  await expect(prepareShownPage(page, undefined, { fill: { id: 'held', values: { name: 'Filled' } } }, undefined, signal)).rejects.toBeInstanceOf(
    SlotFillRefusedError,
  )
})
