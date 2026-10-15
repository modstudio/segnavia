import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { Deck } from '@segnavia/format'

export async function buildAuthoringDemo(root: string, site: string, shell: (body: string, script?: string) => string) {
  const flowShell = (rail = false) =>
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}body{padding:24px;box-sizing:border-box}</style></head><body><segnavia-player${rail ? ' rail' : ''} src="deck.json"></segnavia-player><script type="module" src="segnavia-player.js"></script></body></html>`
  writeFileSync(path.join(site, 'flow.html'), flowShell())
  writeFileSync(path.join(site, 'flow-rail.html'), flowShell(true))
  writeFileSync(path.join(site, 'rail.html'), shell('<segnavia-player id="player" rail src="deck.json"></segnavia-player>'))
  writeFileSync(path.join(site, 'rail-rtl.html'), shell('<segnavia-player id="player" rail src="deck-he.json"></segnavia-player>'))
  const probe = Deck.parse({
    title: 'Focus probe',
    scripts: 'sandboxed',
    slides: [
      {
        id: 'probe',
        content: {
          kind: 'html',
          html: '<input id="thief"><output id="keys">0</output><script>let keys=0;setInterval(()=>document.getElementById("thief").focus(),20);addEventListener("keydown",()=>document.getElementById("keys").textContent=String(++keys))</script>',
        },
      },
      { id: 'second', content: { kind: 'html', html: '<h1>Second</h1>' } },
    ],
  })
  writeFileSync(path.join(site, 'deck-probe.json'), JSON.stringify(probe))
  writeFileSync(path.join(site, 'deck-probe-rtl.json'), JSON.stringify({ ...probe, dir: 'rtl' }))
  writeFileSync(
    path.join(site, 'authoring.html'),
    shell(
      '<input id="unprotected"><segnavia-player id="player" rail src="deck-probe.json" hash="off"></segnavia-player><script type="module" src="authoring-demo.js"></script>',
    ),
  )
  writeFileSync(
    path.join(site, 'authoring-rtl.html'),
    shell('<segnavia-player id="player" rail src="deck-probe-rtl.json" hash="off"></segnavia-player><script type="module" src="authoring-demo.js"></script>'),
  )
  writeFileSync(
    path.join(site, 'react.html'),
    '<!doctype html><html><head><meta charset="utf-8"><style>html,body,#root,segnavia-player{height:100%;margin:0}</style></head><body><div id="root"></div><script type="module" src="react-demo.js"></script></body></html>',
  )
  for (const entry of ['authoring-demo', 'react-demo']) {
    const built = await Bun.build({ entrypoints: [path.join(root, 'fixtures', `${entry}.ts`)], target: 'browser', format: 'esm', minify: true })
    if (!built.success || !built.outputs[0]) throw new Error(`Could not build ${entry}: ${built.logs.join('\n')}`)
    await Bun.write(path.join(site, `${entry}.js`), built.outputs[0])
  }
}
