import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildInPageLinkDemo } from './build-in-page-link-demo.ts'
import { fixedPage, fluidPage, hebrewPage, postcardPage, rightToLeftDivPage } from './demo-page-fixtures.ts'

// The page demo: each page fixture as JSON, and one host page showing them all, with the in-page link frames beside them.
export function buildPageDemo(site: string, shell: (body: string) => string): void {
  writeFileSync(path.join(site, 'page.json'), JSON.stringify(fluidPage))
  writeFileSync(path.join(site, 'page-rtl.json'), JSON.stringify(hebrewPage))
  writeFileSync(path.join(site, 'page-rtl-div.json'), JSON.stringify(rightToLeftDivPage))
  writeFileSync(path.join(site, 'page-fixed.json'), JSON.stringify(fixedPage))
  writeFileSync(path.join(site, 'page-postcard.json'), JSON.stringify(postcardPage))
  writeFileSync(
    path.join(site, 'page.html'),
    shell(
      `<div style="background:#fff;max-width:900px"><segnavia-page id="fluid" src="page.json"></segnavia-page><segnavia-page id="rtl" src="page-rtl.json"></segnavia-page><segnavia-page id="rtl-div" src="page-rtl-div.json"></segnavia-page><segnavia-page id="fixed" src="page-fixed.json"></segnavia-page><segnavia-page id="postcard" src="page-postcard.json"></segnavia-page>${buildInPageLinkDemo(site)}</div>`,
    ),
  )
}
