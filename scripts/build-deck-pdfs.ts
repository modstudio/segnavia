import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'
import { backgroundDeck } from './demo-deck-pdf-fixtures.ts'

export async function buildDeckPdfs(renderer: Renderer, output: string, image: string, inline: (src: string) => string): Promise<void> {
  for (const scripts of ['refuse', 'sandboxed'] as const) {
    const deck = backgroundDeck(scripts, image)
    for (const layout of ['slides', 'notes'] as const) {
      writeFileSync(path.join(output, `deck-backgrounds-${scripts}-${layout}.pdf`), await renderer.deckPdf(deck, { layout, inline }))
    }
  }
}
