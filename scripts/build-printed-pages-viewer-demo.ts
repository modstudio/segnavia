import { writeFileSync } from 'node:fs'
import path from 'node:path'

const paragraphs = Array.from({ length: 900 }, (_, index) => `<p id="line-${index + 1}">שורת תוכן מודפסת ${index + 1}</p>`).join('')

export const printedPagesViewerFixture = {
  type: 'document',
  kind: 'printed',
  settings: { lang: 'he' },
  style: { fonts: { body: { faces: [{}] } } },
  print: { paper: 'letter' },
  parentPages: [{ type: 'parentPage', name: 'body', geometry: { margin: { blockStart: 18, blockEnd: 18, inlineStart: 20, inlineEnd: 20 } } }],
  parentRules: [{ parent: 'body' }],
  children: [{ type: 'page', body: { html: `<style>body{font:16px var(--segnavia-font-body)}p{margin:0 0 10px}</style>${paragraphs}` } }],
} as const

export function buildPrintedPagesViewerDemo(site: string, shell: (body: string) => string): void {
  writeFileSync(path.join(site, 'printed-pages-viewer.json'), JSON.stringify(printedPagesViewerFixture))
  writeFileSync(
    path.join(site, 'printed-pages-viewer.html'),
    shell(`<segnavia-printed-pages id="viewer" style="display:block;inline-size:900px;block-size:500px"></segnavia-printed-pages><script type="module">
const viewer=document.querySelector('#viewer'); window.recordEvents=[]; viewer.addEventListener('record',event=>window.recordEvents.push(event.detail.record)); viewer.recordFor=page=>'record-'+page; viewer.fonts={source:{font:async()=>({family:'sans-serif',faces:[],generic:'sans-serif',present:true})}}; viewer.document=await fetch('printed-pages-viewer.json').then(response=>response.json()); window.viewer=viewer;
</script>`),
  )
}
