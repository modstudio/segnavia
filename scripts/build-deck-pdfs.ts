import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Shot } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { backgroundDeck, handoutDeck, handoutImposition } from './demo-deck-pdf-fixtures.ts'

export async function buildDeckPdfs(renderer: Renderer, output: string, image: string, shot: Shot, inline: (src: string) => string): Promise<void> {
  for (const scripts of ['refuse', 'sandboxed'] as const) {
    const deck = backgroundDeck(scripts, image)
    for (const layout of ['slides', 'notes'] as const) {
      writeFileSync(path.join(output, `deck-backgrounds-${scripts}-${layout}.pdf`), await renderer.deckPdf(deck, { layout, inline }))
    }
  }
  const handout = handoutDeck('refuse', image, shot)
  writeFileSync(path.join(output, 'deck-handout.pdf'), await renderer.deckPdf(handout, { imposition: handoutImposition, inline }))
  writeFileSync(
    path.join(output, 'deck-handout-two-sided.pdf'),
    await renderer.deckPdf(handout, { imposition: { ...handoutImposition, sides: 'two' }, inline }),
  )
  writeFileSync(
    path.join(output, 'deck-handout-cover.pdf'),
    await renderer.deckPdf(handout, { imposition: { ...handoutImposition, fit: 'cover', bleed: 3 }, inline }),
  )
  const limited = await renderer.deckPdf(handout, { imposition: handoutImposition, inline, limits: { maxSheets: 1 } }).then(
    () => 'rendered',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )
  writeFileSync(path.join(output, 'deck-handout-limits.txt'), limited)
  const notes = await renderer.deckPdf(handout, { layout: 'notes', imposition: handoutImposition, inline }).then(
    () => 'rendered',
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )
  writeFileSync(path.join(output, 'deck-handout-notes.txt'), notes)
}
