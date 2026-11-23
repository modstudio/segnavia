import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import type { DeckController, ResolvedContent } from './controller.ts'
import { installFramePoolTestDocument } from './frame-pool.test-helper.ts'
import type { ServedFrameDocument } from './frame-write.ts'
import type { PreparedSlots } from './slot-render.ts'
import { isCurrentThumbnailResolution, thumbnailCanvas, thumbnailScale } from './thumbnail-canvas.ts'

let restoreDocument = () => {}
beforeAll(() => {
  restoreDocument = installFramePoolTestDocument()
})
afterAll(() => restoreDocument())

const served: ServedFrameDocument[] = []
const controller = {
  url: (src: string) => src,
  serveFrame: (document: ServedFrameDocument) => {
    served.push(document)
    return '/frames/thumbnail'
  },
} as DeckController

function htmlThumbnail(html: string, slots?: PreparedSlots, reportsAnimation = false, origins?: Parameters<typeof thumbnailCanvas>[7]) {
  const deck = Deck.parse({ title: 'Thumbnail', slides: [{ id: 'one', content: { kind: 'html', html } }] })
  const slide = deck.slides[0]
  if (!slide) throw new Error('Expected a slide.')
  return thumbnailCanvas(controller, deck, slide, 0, slide.content as ResolvedContent, '', slots, origins, reportsAnimation).querySelector('iframe')
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
    served.length = 0
    const frame = htmlThumbnail('<p>Plain</p>')
    expect(frame?.srcdoc).not.toContain('<script')
    expect(frame?.srcdoc).toContain("script-src 'none'")
    expect(frame?.getAttribute('sandbox')).toBe('')
    expect(served).toHaveLength(0)
  })

  test('a filled shrink slot carries the nonce bridge in a served thumbnail frame', async () => {
    served.length = 0
    const slots = {
      declarations: [],
      report: { fill: null, slots: {}, origins: {} },
      marked: new Map(),
      frames: [],
      apply: () => '<p data-slot-overflow="name:shrink:6">A long name</p>',
      mergeFit: () => ({ fill: null, slots: {}, origins: {} }),
    } satisfies PreparedSlots
    const frame = htmlThumbnail('<p data-slot-value="name">Name</p>', slots)
    await Promise.resolve()
    expect(served[0]?.kind).toBe('thumbnail')
    expect(served[0]?.html).toContain('<script nonce="')
    expect(served[0]?.policy).toContain("script-src 'nonce-")
    expect(frame?.src).toBe('https://frames.example/frames/thumbnail')
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame?.getAttribute('sandbox')).not.toContain('allow-same-origin')
  })

  test('a preview that reports its animation keeps the bridge without allowing author scripts', async () => {
    served.length = 0
    const frame = htmlThumbnail('<p>Rail preview</p>', undefined, true)
    await Promise.resolve()
    expect(served[0]?.html).toContain('<script nonce="')
    expect(served[0]?.policy).toContain("script-src 'nonce-")
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts')
  })

  test('passes approved image origins to the slide frame CSP', () => {
    const frame = htmlThumbnail('<img src="https://images.example/a.png">', undefined, false, [{ origin: 'https://images.example', kinds: ['image'] }])
    expect(frame?.srcdoc).toMatch(/img-src [^;]*https:\/\/images\.example/)
  })

  test('uses only the default origins when no approvals are supplied', () => {
    const frame = htmlThumbnail('<p>Plain</p>')
    expect(frame?.srcdoc).toMatch(
      /(?:^|; )img-src data: blob: https:\/\/api\.iconify\.design https:\/\/images\.pexels\.com https:\/\/images\.unsplash\.com https:\/\/plus\.unsplash\.com(?:;|&quot;|")/,
    )
  })
})
