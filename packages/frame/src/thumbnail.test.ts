import { expect, test } from 'bun:test'
import type { DocumentInput } from '@segnavia/format'
import { Page } from '@segnavia/format'
import { parseDocument } from '@segnavia/html'
import { internalThumbnailPageLoad } from './document-value-load.ts'

test('page readback keeps the parsed document with markdown lowered and ids minted', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', {
    configurable: true,
    value: class HTMLElement extends EventTarget {
      getAttribute() {
        return null
      }
    },
  })
  try {
    const { SegnaviaThumbnail } = await import('./thumbnail.ts')
    const thumbnail = Object.create(SegnaviaThumbnail.prototype) as InstanceType<typeof SegnaviaThumbnail>
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
  } finally {
    if (previous) Object.defineProperty(globalThis, 'HTMLElement', previous)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
  }
})

test('an edition change keeps the last document surface selected by the host', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', {
    configurable: true,
    value: class HTMLElement extends EventTarget {
      getAttribute() {
        return null
      }
    },
  })
  try {
    const { SegnaviaThumbnail } = await import('./thumbnail.ts')
    const thumbnail = Object.create(SegnaviaThumbnail.prototype) as InstanceType<typeof SegnaviaThumbnail>
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
  } finally {
    if (previous) Object.defineProperty(globalThis, 'HTMLElement', previous)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
  }
})

test('clearing a deck clears the displayed deck', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', {
    configurable: true,
    value: class HTMLElement extends EventTarget {
      getAttribute() {
        return null
      }
    },
  })
  try {
    const { SegnaviaThumbnail } = await import('./thumbnail.ts')
    const thumbnail = Object.create(SegnaviaThumbnail.prototype) as InstanceType<typeof SegnaviaThumbnail>
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
  } finally {
    if (previous) Object.defineProperty(globalThis, 'HTMLElement', previous)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
  }
})

test('an edition change keeps an internally loaded page', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', {
    configurable: true,
    value: class HTMLElement extends EventTarget {
      getAttribute() {
        return null
      }
    },
  })
  try {
    const { SegnaviaThumbnail } = await import('./thumbnail.ts')
    const thumbnail = Object.create(SegnaviaThumbnail.prototype) as InstanceType<typeof SegnaviaThumbnail>
    const page = Page.parse({ html: '<p>Internal</p>' })
    Reflect.set(thumbnail, 'updatePageAspect', () => {})
    Reflect.set(thumbnail, 'changed', () => {})
    thumbnail[internalThumbnailPageLoad](page)

    thumbnail.attributeChangedCallback('edition')

    expect(Reflect.get(thumbnail, 'pageValue')).toBe(page)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'HTMLElement', previous)
    else Reflect.deleteProperty(globalThis, 'HTMLElement')
  }
})
