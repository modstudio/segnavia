import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { Document } from '@segnavia/format'
import { sineWav } from './sine-wav.ts'

const slide = (id: string) => ({
  type: 'slide' as const,
  id,
  content: {
    kind: 'html' as const,
    html: `<!doctype html><html><body><main id="${id}">${id}</main></body></html>`,
  },
  narration: {
    text: id,
    words: [{ text: id, startMs: 0, endMs: 400 }],
    durationMs: 400,
    audio: 'audio/progress.wav',
    live: false,
    cues: [],
  },
})

export function buildProgressDemo(site: string, shell: (body: string) => string) {
  const deck = Document.parse({
    type: 'document',
    kind: 'deck',
    title: 'Progress checks',
    settings: { scripts: 'refuse' },
    children: [slide('progress-one'), slide('progress-two'), slide('progress-three')],
  })
  writeFileSync(path.join(site, 'audio/progress.wav'), sineWav(0.4))
  writeFileSync(path.join(site, 'deck-progress.json'), JSON.stringify(deck))
  writeFileSync(
    path.join(site, 'deck-progress-strict.json'),
    JSON.stringify({
      ...deck,
      children: deck.children.map((item) => ({ ...item, narration: { ...item.narration, audio: 'audio/progress.wav?strict' } })),
    }),
  )
  writeFileSync(
    path.join(site, 'progress.html'),
    shell(`<segnavia-player id="progress-player" rail></segnavia-player>
      <script type="module">
        await customElements.whenDefined('segnavia-player')
        const player = document.getElementById('progress-player')
        player.controller.setPlayerOptions({ seek: 'furthest' })
        player.src = 'deck-progress.json'
      </script>`),
  )
  writeFileSync(
    path.join(site, 'strict-csp.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; media-src 'self'"><style>html,body{margin:0;height:100%}segnavia-player{height:100%}</style></head><body><segnavia-player id="strict-player" src="deck-progress-strict.json"></segnavia-player><script type="module" src="segnavia-player.js"></script></body></html>`,
  )
}
