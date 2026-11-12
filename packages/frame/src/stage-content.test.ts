import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Deck } from '@segnavia/format'
import type { DeckController, ResolvedContent } from './controller.ts'
import { installFramePoolTestDocument } from './frame-pool.test-helper.ts'
import { LAYOUT_FRAME_ATTRIBUTE } from './layout.ts'
import { stageCanvas } from './stage-content.ts'

let restoreDocument = () => {}
beforeAll(() => {
  restoreDocument = installFramePoolTestDocument()
})
afterAll(() => restoreDocument())

const deck = Deck.parse({
  title: 'Stage frames',
  scripts: 'sandboxed',
  slides: [
    { id: 'html', content: { kind: 'html', html: '<p>HTML</p>' } },
    { id: 'url', content: { kind: 'url', src: 'hosted.html' } },
  ],
})
const controller = { url: (src: string) => `https://example.test/${src}` } as DeckController
const options = { css: '', csp: '', frameTitle: () => '', loaded: () => {}, folio: { number: 1, text: '1', printed: true } }

describe('stageCanvas', () => {
  test('permits forms only in frame-policy HTML documents', () => {
    const htmlSlide = deck.slides[0]
    const urlSlide = deck.slides[1]
    if (!htmlSlide || !urlSlide) throw new Error('Expected the HTML and URL test slides.')
    const html = stageCanvas(controller, deck, htmlSlide, htmlSlide.content as ResolvedContent, options)
    const url = stageCanvas(controller, deck, urlSlide, urlSlide.content as ResolvedContent, options)
    expect(html.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts allow-forms')
    expect(url.querySelector('iframe')?.getAttribute('sandbox')).toBe('allow-scripts')
  })

  test('reports a style compile refusal without mounting a partial frame', () => {
    const refused = Deck.parse({
      ...deck,
      style: { textStyles: { body: { kind: 'paragraph', basedOn: 'missing' } } },
    })
    const slide = refused.slides[0]
    if (!slide) throw new Error('Expected the HTML slide.')
    const errors: Error[] = []
    const canvas = stageCanvas(controller, refused, slide, slide.content as ResolvedContent, { ...options, failed: (error) => errors.push(error) })
    expect(canvas.querySelector('iframe')).toBeNull()
    expect(errors[0]?.message).toContain('textStyles.body.basedOn')
  })

  test('a layout slide waits for the written document load and paints a refusal document when loading fails', async () => {
    const selected = Deck.parse({
      ...deck,
      slides: [{ id: 'layout', content: { kind: 'html', html: '<p data-segnavia-layout="unknown">Layout</p>' } }],
    })
    const slide = selected.slides[0]
    if (!slide) throw new Error('Expected the layout slide.')
    let loads = 0
    const errors: Error[] = []
    const canvas = stageCanvas(controller, selected, slide, slide.content as ResolvedContent, {
      ...options,
      loaded: () => loads++,
      failed: (error) => errors.push(error),
    })
    const iframe = canvas.querySelector('iframe') as (HTMLIFrameElement & { dispatch(name: string): void }) | null
    expect(iframe?.getAttribute(LAYOUT_FRAME_ATTRIBUTE)).toBe('')
    iframe?.dispatch('load')
    expect(loads).toBe(0)
    await Promise.resolve()
    await Promise.resolve()
    expect(errors[0]?.message).toContain('unknown')
    expect(iframe?.srcdoc).toContain('unknown')
    iframe?.dispatch('load')
    expect(loads).toBe(1)
  })
})
