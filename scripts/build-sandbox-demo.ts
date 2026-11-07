import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { Document } from '@segnavia/format'
import { bridgeForHost } from '@segnavia/frame/bridge'

export function buildSandboxDemo(site: string, shell: (body: string) => string): void {
  const scripted = Document.parse({
    type: 'document',
    kind: 'deck',
    title: 'Scripts allowed',
    settings: { scripts: 'sandboxed' },
    children: [
      {
        type: 'slide',
        id: 'runs',
        content: {
          kind: 'html',
          html: '<h1 id="t">waiting</h1><script>document.getElementById("t").textContent = "ran"; document.body.style.background = "rgb(0, 128, 0)"</script>',
        },
      },
      { type: 'slide', id: 'next', content: { kind: 'html', html: '<h1>second</h1>' } },
    ],
  })
  writeFileSync(path.join(site, 'deck-scripted.json'), JSON.stringify(scripted))
  writeFileSync(path.join(site, 'scripted.html'), shell('<segnavia-player src="deck-scripted.json" hash="off"></segnavia-player>'))
  // A page the host serves itself, as a preview ticket would be: its own CSP,
  // and the bridge included under the host's nonce to report its height.
  writeFileSync(
    path.join(site, 'ticket-page.html'),
    `<!doctype html><html><head><meta charset="utf-8"><script>${bridgeForHost({ relayKeys: false })}</script></head><body style="margin:0"><div style="height:420px;background:#fde68a">served by the host</div></body></html>`,
  )
  writeFileSync(
    path.join(site, 'ticket.html'),
    shell(
      '<div style="background:#fff;width:800px"><segnavia-page id="ticket"></segnavia-page></div><script type="module">await customElements.whenDefined("segnavia-page"); document.getElementById("ticket").showUrl("ticket-page.html")</script>',
    ),
  )
}
