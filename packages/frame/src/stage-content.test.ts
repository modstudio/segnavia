import { describe, expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import type { DeckController, ResolvedContent } from './controller.ts'
import { installFramePoolTestDocument } from './frame-pool.test-helper.ts'
import { stageCanvas } from './stage-content.ts'

installFramePoolTestDocument()

const deck = Deck.parse({
  title: 'Stage frames',
  scripts: 'sandboxed',
  slides: [
    { id: 'html', content: { kind: 'html', html: '<p>HTML</p>' } },
    { id: 'url', content: { kind: 'url', src: 'hosted.html' } },
  ],
})
const controller = { url: (src: string) => `https://example.test/${src}` } as DeckController
const options = { css: '', csp: '', frameTitle: () => '', loaded: () => {} }

describe('stageCanvas', () => {
  test('permits forms only in frame-policy HTML documents', () => {
    const htmlSlide = deck.slides[0]
    const urlSlide = deck.slides[1]
    if (!htmlSlide || !urlSlide) throw new Error('Expected the HTML and URL test slides.')
    const html = stageCanvas(controller, deck, htmlSlide, 0, htmlSlide.content as ResolvedContent, options)
    const url = stageCanvas(controller, deck, urlSlide, 1, urlSlide.content as ResolvedContent, options)
    expect(html.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts allow-forms')
    expect(url.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts')
  })
})
