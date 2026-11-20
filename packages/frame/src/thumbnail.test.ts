import { expect, test } from 'bun:test'
import type { DocumentInput } from '@segnavia/format'
import { Page } from '@segnavia/format'
import { parseDocument } from '@segnavia/html'
import { internalThumbnailPageLoad } from './document-value-load.ts'

const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
const installedHTMLElement = globalThis.HTMLElement === undefined
if (installedHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: class extends EventTarget {} })
const { SegnaviaThumbnail } = await import('./thumbnail.ts')
if (installedHTMLElement) {
  if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
  else Reflect.deleteProperty(globalThis, 'HTMLElement')
}

function thumbnailHarness() {
  const thumbnail = Object.create(SegnaviaThumbnail.prototype) as InstanceType<typeof SegnaviaThumbnail>
  Object.defineProperty(thumbnail, 'edition', { configurable: true, value: undefined })
  return thumbnail
}

test('page readback keeps the parsed document with markdown lowered and ids minted', () => {
  const thumbnail = thumbnailHarness()
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

test('an edition change keeps the last document surface selected by the host', () => {
  const thumbnail = thumbnailHarness()
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

test('clearing a deck clears the displayed deck', () => {
  const thumbnail = thumbnailHarness()
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

test('an edition change keeps an internally loaded page', () => {
  const thumbnail = thumbnailHarness()
  const page = Page.parse({ html: '<p>Internal</p>' })
  Reflect.set(thumbnail, 'updatePageAspect', () => {})
  Reflect.set(thumbnail, 'changed', () => {})
  thumbnail[internalThumbnailPageLoad](page)

  thumbnail.attributeChangedCallback('edition')

  expect(Reflect.get(thumbnail, 'pageValue')).toBe(page)
})

test('ratio validates once at the thumbnail property edge', () => {
  const thumbnail = thumbnailHarness()
  const values = new Map<string, string>()
  Reflect.set(thumbnail, 'style', {
    setProperty(name: string, value: string) {
      values.set(name, value)
    },
    removeProperty(name: string) {
      values.delete(name)
    },
  })
  Reflect.set(thumbnail, 'changed', () => {})
  thumbnail.ratio = 'square'
  expect(thumbnail.ratio).toBe('square')
  expect(values.get('--segnavia-thumbnail-ratio')).toBe('1 / 1')
  thumbnail.ratio = 'natural'
  expect(values.has('--segnavia-thumbnail-ratio')).toBeFalse()
  expect(() => {
    thumbnail.ratio = 'wide' as 'square'
  }).toThrow('use natural or square')
})

test('a square thumbnail contains a portrait deck canvas', () => {
  const thumbnail = thumbnailHarness()
  const canvas = { style: { transform: '' } }
  Object.assign(thumbnail, {
    clientWidth: 100,
    clientHeight: 100,
    viewport: { firstElementChild: canvas },
    value: { size: { width: 100, height: 200 } },
    ratioValue: 'square',
  })

  ;(SegnaviaThumbnail.prototype as unknown as { measure(this: typeof thumbnail): void }).measure.call(thumbnail)

  expect(canvas.style.transform).toBe('scale(0.5)')
})
