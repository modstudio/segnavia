import { expect, test } from 'bun:test'
import { boundPreflightReport, Page, PREFLIGHT_PRESETS, preflightRefusal } from '@segnavia/format'
import { resolvePageHtml } from '@segnavia/html'
import { expandFramePage } from './motif-expansion.ts'
import { printedPageValueDocument } from './printed-page-document.ts'

const page = Page.parse({
  html: '<p>Body</p>',
  print: { paper: 'a4' },
  printedPages: {
    parents: [{ name: 'body', margin: { blockStart: 20, blockEnd: 20, inlineStart: 15, inlineEnd: 15 } }],
    parentRules: [{ parent: 'body' }],
  },
})

test('omits preflight config without a profile', () => {
  expect(printedPageValueDocument(resolvePageHtml(page), { nonce: 'held' })).not.toContain('"preflight"')
})

test('keeps an unsupplied declared face out of the preflight seed', () => {
  const styled = Page.parse({ ...page, style: { fonts: { body: { faces: [{}] } } } })
  const html = printedPageValueDocument(resolvePageHtml(styled), {
    nonce: 'held',
    profile: PREFLIGHT_PRESETS.strict,
    fontFailures: [{ font: 'body', family: 'body', reason: 'unsupplied' }],
  })
  expect(html).toContain('"fontLoads":[{"font":"body"')
  expect(html).toContain('"preflightSeed":[]')
  expect(html.match(/"check":"font-missing"/g)).toBeNull()
})

test('carries a missing placement seed into strict printed-page composition', async () => {
  const { body: _body, ...pageWithoutBody } = page
  const placed = Page.parse({ ...pageWithoutBody, html: '<img data-segnavia-media="cover">' })
  const expanded = await expandFramePage(
    resolvePageHtml(placed),
    undefined,
    new AbortController().signal,
    { resolve: async () => undefined },
    'print',
    undefined,
    undefined,
    PREFLIGHT_PRESETS.strict,
  )
  const html = printedPageValueDocument(expanded.page, {
    nonce: 'held',
    profile: PREFLIGHT_PRESETS.strict,
    preflightSeed: expanded.preflight,
  })
  expect(html).toContain('"preflightSeed":[{"check":"placement-missing","subject":"cover"')
  expect(preflightRefusal(boundPreflightReport({ entries: expanded.preflight, facts: { pageCount: 0, pages: [], fits: [] } }, PREFLIGHT_PRESETS.strict))).toBe(
    'Placement cover is missing; supply a resolvable placement to clear it.',
  )
})
