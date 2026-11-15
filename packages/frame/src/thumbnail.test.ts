import { expect, test } from 'bun:test'
import type { DocumentInput } from '@segnavia/format'
import { Page } from '@segnavia/format'
import { parseDocument } from '@segnavia/html'
import { internalThumbnailPageLoad } from './document-value-load.ts'

type Thumbnail = InstanceType<typeof import('./thumbnail.ts').SegnaviaThumbnail>

// The element module may already be loaded by another test file under that
// file's HTMLElement stand-in, so the instance carries its own attribute read
// rather than relying on whichever base class the cached module extends.
async function bareThumbnail(): Promise<Thumbnail> {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', {
    configurable: true,
    value: class HTMLElement extends EventTarget {},
  })
  try {
    const { SegnaviaThumbnail } = await import('./thumbnail.ts')
    const thumbnail = Object.create(SegnaviaThumbnail.prototype) as Thumbnail
    Reflect.set(thumbnail, 'getAttribute', () => null)
    return thumbnail
  } finally {
    if (previous) Object.defineProperty(globalThis, 'HTMLElement', previous)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
  }
}

test('page readback keeps the parsed document with markdown lowered and ids minted', async () => {
  const thumbnail = await bareThumbnail()
  Reflect.set(thumbnail, 'updatePageAspect', () => {})
  Reflect.set(thumbnail, 'changed', () => {})
  let id = 0
  const newId = () => `thumbnail-${++id}`
  const input = {
    type: 'document',
    kind: 'page',
    children: [{ type: 'page', body: { markdown: '# Thumbnail' } }],
  } satisfies DocumentInput
  const parsed = parseDocument(input, { newId })

  thumbnail.page = parsed

  expect(thumbnail.page).toEqual(parsed)
})

test('an edition change keeps the last document surface selected by the host', async () => {
  const thumbnail = await bareThumbnail()
  Object.defineProperty(thumbnail, 'edition', { configurable: true, value: 'teacher' })
  Reflect.set(thumbnail, 'style', { setProperty() {}, removeProperty() {} })
  Reflect.set(thumbnail, 'updatePageAspect', () => {})
  Reflect.set(thumbnail, 'changed', () => {})
  const editions = {
    conditions: [{ type: 'condition' as const, name: 'teacher' }],
    editions: [
      { type: 'edition' as const, name: 'student', conditions: [] },
      { type: 'edition' as const, name: 'teacher', conditions: ['teacher'] },
    ],
    defaultEdition: 'student',
  }
  thumbnail.deck = {
    ...editions,
    type: 'document',
    kind: 'deck',
    title: 'Deck',
    children: [{ type: 'slide', content: { kind: 'html', html: '<p>Deck</p>' } }],
  }
  thumbnail.page = {
    ...editions,
    type: 'document',
    kind: 'page',
    children: [{ type: 'page', body: { html: '<p>Page<span data-segnavia-condition="teacher"> Answer</span></p>' } }],
  }

  thumbnail.attributeChangedCallback('edition')

  expect(thumbnail.deck).toBeNull()
  expect(JSON.stringify(thumbnail.page)).toContain('Answer')
  expect(JSON.stringify(thumbnail.page)).not.toContain('Deck')
})

test('clearing a deck clears the displayed deck', async () => {
  const thumbnail = await bareThumbnail()
  Reflect.set(thumbnail, 'style', { setProperty() {}, removeProperty() {} })
  Reflect.set(thumbnail, 'changed', () => {})
  thumbnail.deck = {
    type: 'document',
    kind: 'deck',
    title: 'Deck',
    children: [{ type: 'slide', content: { kind: 'html', html: '<p>Deck</p>' } }],
  }

  thumbnail.deck = null

  expect(Reflect.get(thumbnail, 'value')).toBeNull()
})

test('an edition change keeps an internally loaded page', async () => {
  const thumbnail = await bareThumbnail()
  const page = Page.parse({ html: '<p>Internal</p>' })
  Reflect.set(thumbnail, 'updatePageAspect', () => {})
  Reflect.set(thumbnail, 'changed', () => {})
  thumbnail[internalThumbnailPageLoad](page)

  thumbnail.attributeChangedCallback('edition')

  expect(Reflect.get(thumbnail, 'pageValue')).toBe(page)
})
