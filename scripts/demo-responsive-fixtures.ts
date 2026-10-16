import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { Deck } from '@segnavia/format'

export function writeResponsiveDemo(site: string) {
  const deck = Deck.parse({
    title: 'Responsive deck',
    layout: 'responsive',
    scripts: 'sandboxed',
    slides: [
      {
        id: 'responsive-html',
        content: {
          kind: 'html',
          html: `<!doctype html><style>html,body{margin:0;height:100%;background:rgb(30,100,180)}@media(max-width:499px){body{background:rgb(220,80,60)}}body{display:grid;place-items:center;color:white;font:32px system-ui}</style><output id="size"></output><script>const report=()=>size.textContent=innerWidth+'x'+innerHeight;addEventListener('resize',report);new ResizeObserver(report).observe(document.documentElement);report()</script>`,
        },
      },
      { id: 'responsive-image', content: { kind: 'image', src: 'responsive-wide.svg', alt: 'Wide responsive fixture', fit: 'contain' } },
    ],
  })
  writeFileSync(path.join(site, 'responsive-deck.json'), JSON.stringify(deck, null, 2))
  writeFileSync(
    path.join(site, 'responsive-wide.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="400" viewBox="0 0 1280 400"><rect width="1280" height="400" fill="#2457c5"/></svg>',
  )
  const shell = (body: string) =>
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}#host{inline-size:720px;block-size:520px}#host>segnavia-stage,#host>segnavia-player{inline-size:100%;block-size:100%}</style></head><body><div id="host">${body}</div><script type="module" src="segnavia-player.js"></script></body></html>`
  writeFileSync(path.join(site, 'responsive-stage.html'), shell('<segnavia-stage src="responsive-deck.json" hash="off"></segnavia-stage>'))
  writeFileSync(
    path.join(site, 'responsive-player-height.html'),
    shell('<segnavia-player fit="height" src="responsive-deck.json" hash="off"></segnavia-player>'),
  )
  writeFileSync(path.join(site, 'responsive-fixed.html'), shell('<segnavia-stage src="deck.json" hash="off"></segnavia-stage>'))
  writeFileSync(
    path.join(site, 'responsive-thumbnail.html'),
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}segnavia-thumbnail{inline-size:320px}</style></head><body><segnavia-thumbnail></segnavia-thumbnail><script type="module" src="segnavia.js"></script><script type="module">await customElements.whenDefined(\'segnavia-thumbnail\');const thumbnail=document.querySelector(\'segnavia-thumbnail\');thumbnail.base=new URL(\'responsive-deck.json\',location.href).href;thumbnail.deck=await fetch(\'responsive-deck.json\').then(response=>response.json())</script></body></html>',
  )
  writeFileSync(
    path.join(site, 'responsive-player-contain.html'),
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}segnavia-player{inline-size:100%;--segnavia-fit-reserve:40px}</style></head><body><segnavia-player src="responsive-deck.json" hash="off"></segnavia-player><script type="module" src="segnavia-player.js"></script></body></html>',
  )
}
