import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { labelPages, labelsImposition } from './demo-page-fixtures.ts'

export function buildPaperDemo(site: string): void {
  writeFileSync(path.join(site, 'label-pages.json'), JSON.stringify(labelPages))
  writeFileSync(path.join(site, 'labels-imposition.json'), JSON.stringify(labelsImposition))
  writeFileSync(
    path.join(site, 'paper.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>html,body{margin:0}body{padding:24px;background:#ddd}.paper-container{width:612px;margin-block-end:24px}</style></head><body>
    <div id="first-container" class="paper-container"><segnavia-paper id="first"></segnavia-paper></div>
    <div class="paper-container"><segnavia-paper id="second" paper="1"></segnavia-paper></div>
    <div class="paper-container"><segnavia-paper id="rtl"></segnavia-paper></div>
    <div class="paper-container"><segnavia-paper id="bare" unstyled></segnavia-paper></div>
    <script type="module" src="segnavia.js"></script><script type="module">
      await customElements.whenDefined('segnavia-paper')
      const pages = await (await fetch('label-pages.json')).json()
      const imposition = await (await fetch('labels-imposition.json')).json()
      document.getElementById('first').load(pages.slice(0, 30), imposition)
      document.getElementById('second').load(pages, imposition)
      document.getElementById('rtl').load(pages.slice(0, 1), { ...imposition, dir: 'rtl' })
      document.getElementById('bare').load(pages.slice(0, 1), imposition)
    </script></body></html>`,
  )
}
