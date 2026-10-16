import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { Deck, type Shot } from '@segnavia/format'

export const fitShot: Shot = {
  key: 'fit.tall',
  title: 'Tall fit example',
  description: 'A tall page capture with an annotation near its bottom.',
  tags: ['fit'],
  file: 'fit-tall.svg',
  annotatedFile: null,
  size: { width: 1280, height: 2400 },
  scale: 1,
  dir: 'ltr',
  annotations: [
    {
      ring: { x: 100, y: 2100, width: 200, height: 100 },
      badge: null,
      arrow: { head: { x: 640, y: 2100 }, tail: { x: 640, y: 1400 }, label: 'Keep this entire arrow label shown' },
    },
  ],
  capturedAt: 'now',
  meta: {},
}

export const fitDeck = Deck.parse({
  title: 'Image fit modes',
  frame: true,
  slides: [
    ...(['contain', 'cover', 'width', 'focus'] as const).map((fit) => ({
      id: fit,
      content: { kind: 'shot' as const, src: `shots/${fitShot.file}`, shot: fitShot, fit, frame: false },
    })),
    { id: 'framed', content: { kind: 'image' as const, src: 'shots/fit-wide.svg', alt: 'Wide framed image', fit: 'contain' as const } },
  ],
})

const tallImage = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="2400" viewBox="0 0 1280 2400">
<rect width="1280" height="2400" fill="#e8f0ff"/><rect x="56" y="56" width="1168" height="260" rx="28" fill="#23458f"/>
<g fill="#fff" font-family="system-ui" font-size="72" font-weight="700"><text x="110" y="180">Tall page capture</text></g>
<g fill="#bdd0f7"><rect x="80" y="390" width="1120" height="260" rx="24"/><rect x="80" y="710" width="1120" height="260" rx="24"/><rect x="80" y="1030" width="1120" height="260" rx="24"/><rect x="80" y="1350" width="1120" height="260" rx="24"/><rect x="80" y="1670" width="1120" height="260" rx="24"/></g>
<rect x="80" y="2050" width="1120" height="230" rx="24" fill="#9bcdb5"/><text x="112" y="2180" fill="#143d2b" font-family="system-ui" font-size="58" font-weight="700">Annotated action near the bottom</text>
</svg>`

const wideImage = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="400" viewBox="0 0 1280 400">
<rect width="1280" height="400" fill="#2563eb"/><text x="640" y="220" text-anchor="middle" fill="#fff" font-family="system-ui" font-size="72" font-weight="700">Framed wide image</text>
</svg>`

export function writeFitDemo(site: string): void {
  writeFileSync(path.join(site, 'shots', fitShot.file), tallImage)
  writeFileSync(path.join(site, 'shots', 'fit-wide.svg'), wideImage)
  writeFileSync(path.join(site, 'deck-fit.json'), JSON.stringify(fitDeck, null, 2))
  writeFileSync(
    path.join(site, 'fit.html'),
    `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;padding:20px;background:#ddd;font:16px system-ui}main{display:grid;grid-template-columns:1fr 1fr;gap:20px}section{min-width:0}segnavia-player,segnavia-stage{inline-size:100%;aspect-ratio:16/9}
    #unstyled{display:block;position:relative;overflow:hidden}#unstyled .segnavia-stage__canvas{position:absolute;left:50%;top:50%;transform-origin:center}h1{font-size:18px;margin:0 0 8px}
    </style></head><body><main><section><h1>Player</h1><segnavia-player id="player" src="deck-fit.json" hash="off" controls="overlay"></segnavia-player></section><section><h1>Unstyled stage</h1><segnavia-stage id="unstyled" src="deck-fit.json" hash="off" unstyled></segnavia-stage></section></main><script type="module" src="segnavia.js"></script></body></html>`,
  )
}
