import { expect, test } from 'bun:test'
import type { DocumentInput } from '@segnavia/format'
import { parseDocument } from '@segnavia/html'

test('page readback keeps the parsed document with markdown lowered and ids minted', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: class HTMLElement extends EventTarget {} })
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
