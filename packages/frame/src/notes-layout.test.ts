import { expect, test } from 'bun:test'
import { paginateNotes } from './notes-layout.ts'

test('pagination segments only a bounded prefix when the remaining note is enormous', () => {
  const notes = {
    clientHeight: 100,
    clientWidth: 100,
    scrollHeight: 0,
    scrollWidth: 0,
    _text: '',
    get textContent() {
      return this._text
    },
    set textContent(value: string) {
      this._text = value
      this.scrollHeight = value.length
      this.scrollWidth = 100
    },
  }
  const sheet = {
    dataset: { notesText: 'a'.repeat(1_000_000), slideIndex: '0', slideNumber: '1' },
    querySelector: () => notes,
  }
  const target = {
    querySelectorAll: (selector: string) => (selector === '[data-notes-source]' ? [sheet] : []),
  }
  const OriginalSegmenter = Intl.Segmenter
  let segmented = 0
  class CountingSegmenter {
    segment(value: string) {
      segmented += value.length
      return new OriginalSegmenter(undefined, { granularity: 'grapheme' }).segment(value)
    }
  }
  Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: CountingSegmenter })
  try {
    expect(paginateNotes(target as unknown as Document, 1)).toEqual({ sheets: 1, exceeded: true })
    expect(segmented).toBeLessThan(10_000)
  } finally {
    Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: OriginalSegmenter })
  }
})
