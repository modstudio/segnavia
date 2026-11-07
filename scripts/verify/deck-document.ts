import type { Deck, DocumentInput } from '@segnavia/format'
import type { Harness } from './harness.ts'

declare global {
  interface Window {
    deckDocument(deck: Deck, notes: string): DocumentInput
  }
}

export async function installDeckDocument(page: Harness['page']): Promise<void> {
  await page.evaluate(() => {
    window.deckDocument = (deck, notes) => ({
      type: 'document',
      kind: 'deck',
      title: deck.title,
      size: deck.size,
      layout: deck.layout,
      fit: deck.fit,
      frame: deck.frame,
      transition: deck.transition,
      playback: deck.playback,
      captions: deck.captions,
      settings: { scripts: deck.scripts, dir: deck.dir, lang: deck.lang },
      data: { slots: deck.slots },
      children: deck.slides.map((slide) => ({ type: 'slide', ...slide, notes })),
    })
  })
}
