import { expect, test } from 'bun:test'
import { itemSettingsOpenEvent } from './item-settings-open.ts'

test('item settings open requests carry the current item and cross the host boundary', () => {
  const slide = itemSettingsOpenEvent({ slideId: 'slide-a' })
  const page = itemSettingsOpenEvent({ pageId: 'page-b' })

  expect({ type: slide.type, detail: slide.detail, bubbles: slide.bubbles, composed: slide.composed }).toEqual({
    type: 'segnavia-item-settings-open',
    detail: { slideId: 'slide-a' },
    bubbles: true,
    composed: true,
  })
  expect(page.detail).toEqual({ pageId: 'page-b' })
})
