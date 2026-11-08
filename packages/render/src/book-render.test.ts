import { expect, test } from 'bun:test'
import { StyleSheet } from '@segnavia/format'
import { frameStyleSheets } from '@segnavia/frame/bridge'
import { parseBookFixture } from '@segnavia/html'
import { continuousBookNeedsScripts, lastBookPlanText, renderBrowserBookPdf, renderBrowserBookPlan, usesKeepWith } from './book-render.ts'
import { RenderRefusedError } from './errors.ts'

test('enables the continuous print bridge only when markup or a stylesheet declares a keep', () => {
  expect(usesKeepWith('<span style="--segnavia-keep-with:next">1</span> word')).toBe(true)
  expect(usesKeepWith('<p><span class="seif">1</span> word</p>', '.seif{--segnavia-keep-with:next}')).toBe(true)
  expect(usesKeepWith('<p>ordinary book text</p>', undefined, 'p{margin:0}')).toBe(false)
})

test('typed paragraph keeps enable scripts for continuous books', () => {
  const kept = frameStyleSheets(StyleSheet.parse({ textStyles: { heading: { kind: 'paragraph', keepWithNext: true } } }))
  expect(continuousBookNeedsScripts('<p class="segnavia-style-heading">Heading</p>', kept, undefined, 'refuse', false)).toBe(true)
  expect(continuousBookNeedsScripts('<p>Ordinary</p>', frameStyleSheets(undefined), undefined, 'refuse', false)).toBe(false)
})

test('bookPlan turns a style sheet that cannot merge into a render refusal before opening a tab', async () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    style: { textStyles: { body: { kind: 'paragraph', basedOn: 'missing' } } },
    chapters: [{ id: 'one', title: 'One', html: '<p>Text</p>' }],
  })
  let opened = false
  const planned = renderBrowserBookPlan(book, {}, '', async () => {
    opened = true
    throw new Error('no tab expected')
  })
  await expect(planned).rejects.toThrow(RenderRefusedError)
  await expect(planned).rejects.toThrow(/textStyles\.body\.basedOn/)
  expect(opened).toBe(false)
})

test.each([
  { option: 'plan', options: { plan: {} as never } },
  { option: 'breaks', options: { breaks: ['chapter'] as string[] } },
])('bookPdf refuses $option for a continuous book before opening a tab', async ({ options }) => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'continuous',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    chapters: [{ id: 'one', title: 'One', html: '<p>Text</p>' }],
  })
  let opened = false

  await expect(
    renderBrowserBookPdf(book, options, '', {
      render: async () => {
        opened = true
        throw new Error('no tab expected')
      },
      fontFaces: () => '',
      finish: async (pdf) => pdf,
    }),
  ).rejects.toThrow('bookPdf with plan or breaks needs a paginated book; set mode to paginated to clear this refusal')
  expect(opened).toBe(false)
})

test('bookPlan reads its published carrier after an authored plan carrier', () => {
  const authored = { textContent: '{"fingerprint":"authored"}' }
  const published = { textContent: '{"fingerprint":"published"}' }
  const root = { querySelectorAll: () => [authored, published] }

  expect(lastBookPlanText(root as unknown as ParentNode)).toBe(published.textContent)
})

test('bookPlan measures the host-filled text that bookPdf prints', async () => {
  const book = parseBookFixture({
    title: 'Workbook',
    mode: 'paginated',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    slots: [{ key: 'school', label: 'School', type: 'text', required: true }],
    chapters: [{ title: 'One', html: '<p data-slot-value="school">School</p>' }],
  })
  let html = ''

  await renderBrowserBookPlan(book, { slots: { fill: { id: 'host', values: { school: 'Lincoln School' } } } }, '', async (setup) => {
    html = setup.html
    throw new Error('no tab expected')
  }).catch(() => undefined)

  expect(html).toContain('Lincoln School')
})

test('bookPlan refuses a continuous book before opening a tab', async () => {
  const book = parseBookFixture({
    title: 'Book',
    mode: 'continuous',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    chapters: [{ id: 'one', title: 'One', html: '<p>Text</p>' }],
  })
  let opened = false

  await expect(
    renderBrowserBookPlan(book, {}, '', async () => {
      opened = true
      throw new Error('no tab expected')
    }),
  ).rejects.toThrow('bookPlan needs a paginated book; set mode to paginated to clear this refusal')
  expect(opened).toBe(false)
})
