import { expect, test } from 'bun:test'
import type { HtmlPage } from '@segnavia/html'
import { preparePaperDays } from './paper-day.ts'

test('paper refuses distinct page days when slots.resolve must supply one rendering', async () => {
  const pages: HtmlPage[] = [
    { html: '<main>One</main>', scripts: 'refuse', asOf: { kind: 'fixed', date: '2026-11-14' } },
    { html: '<main>Two</main>', scripts: 'refuse', asOf: { kind: 'fixed', date: '2026-11-15' } },
  ]
  const promise = preparePaperDays(
    pages,
    { moment: Date.parse('2026-11-14T12:00:00Z') },
    { slots: { resolve: async () => undefined }, signal: new AbortController().signal },
  )
  await expect(promise).rejects.toThrow('2026-11-14')
  await expect(promise).rejects.toThrow('2026-11-15')
})
