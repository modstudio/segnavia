import { describe, expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import type { DeckController, ResolvedContent } from './controller.ts'
import { installFramePoolTestDocument } from './frame-pool.test-helper.ts'
import type { PreparedSlots } from './slot-render.ts'
import { isCurrentThumbnailResolution, thumbnailCanvas, thumbnailScale } from './thumbnail-canvas.ts'

installFramePoolTestDocument()

const controller = { url: (src: string) => src } as DeckController

function htmlThumbnail(html: string, slots?: PreparedSlots) {
  const deck = Deck.parse({ title: 'Thumbnail', slides: [{ id: 'one', content: { kind: 'html', html } }] })
  const slide = deck.slides[0]
  if (!slide) throw new Error('Expected a slide.')
  return thumbnailCanvas(controller, deck, slide, 0, slide.content as ResolvedContent, '', slots).querySelector('iframe')
}

describe('thumbnail geometry and resolution identity', () => {
  test('scales the deck width to the available inline size', () => {
    expect(thumbnailScale(320, 1280)).toBe(0.25)
  })

  test('only the latest resolution may be mounted', () => {
    expect(isCurrentThumbnailResolution(3, 3)).toBe(true)
    expect(isCurrentThumbnailResolution(2, 3)).toBe(false)
  })

  test('an HTML thumbnail without fitted slots has no script capability', () => {
    const frame = htmlThumbnail('<p>Plain</p>')
    expect(frame?.srcdoc).not.toContain('<script')
    expect(frame?.srcdoc).toContain("script-src 'none'")
    expect(frame?.getAttribute('sandbox')).toBe('')
  })

  test('a filled shrink slot carries the nonce bridge in a refused-script sandbox', () => {
    const slots = {
      declarations: [],
      report: { fill: null, slots: {}, origins: {} },
      marked: new Map(),
      apply: () => '<p data-slot-overflow="name:shrink:6">A long name</p>',
      mergeFit: () => ({ fill: null, slots: {}, origins: {} }),
    } satisfies PreparedSlots
    const frame = htmlThumbnail('<p data-slot-value="name">Name</p>', slots)
    expect(frame?.srcdoc).toContain('<script nonce="')
    expect(frame?.srcdoc).toContain("script-src 'nonce-")
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame?.getAttribute('sandbox')).not.toContain('allow-same-origin')
  })

  test('the unfilled canvas used by the rail is script-free', () => {
    expect(htmlThumbnail('<p>Rail preview</p>')?.srcdoc).not.toContain('<script')
  })
})
