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
      children: deck.children.map((item) => (item.type === 'slide' ? { ...item, narration: { ...item.narration, audio: 'audio/progress.wav?strict' } } : item)),
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
    `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; media-src 'self'; frame-src 'self'"><style>segnavia-player{display:block;height:260px}segnavia-page{display:block}</style></head><body><segnavia-player id="strict-control" src="deck-progress-strict.json"></segnavia-player><segnavia-player id="strict-player" src="deck-progress-strict.json"></segnavia-player><segnavia-page id="strict-page"></segnavia-page><script type="module" src="segnavia-player.js"></script><script type="module" src="strict-csp.js"></script></body></html>`,
  )
  writeFileSync(
    path.join(site, 'strict-csp.js'),
    `await Promise.all([customElements.whenDefined('segnavia-player'),customElements.whenDefined('segnavia-page')]);
const serveFrame=async document=>{const response=await fetch('/served-frame',{method:'POST',headers:{'content-type':'text/html','x-segnavia-policy':document.policy},body:document.html});if(!response.ok)throw new Error('The demo frame store refused the document.');return response.text()};
const player=document.getElementById('strict-player');player.serveFrame=serveFrame;
const page=document.getElementById('strict-page');page.serveFrame=serveFrame;page.page={type:'document',kind:'page',children:[{type:'page',body:{html:'<main id="strict-page-content" style="height:240px">served page</main>'}}]};`,
  )
}
