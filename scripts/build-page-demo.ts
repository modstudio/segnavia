import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildInPageLinkDemo } from './build-in-page-link-demo.ts'
import { buildScriptedDependencyDemo } from './build-scripted-dependency-demo.ts'
import { emptyDirectionPage, fixedPage, fluidPage, hebrewPage, markdownPage, ownDirectionPage, postcardPage, rightToLeftDivPage } from './demo-page-fixtures.ts'

const printedLines = (text: string) =>
  `<style>body{font:16px sans-serif}p{margin:0 0 12px}</style>${Array.from({ length: 70 }, (_, index) => `<p>${text} ${index + 1}</p>`).join('')}`

export const PRINTED_PAGE_DEMO_PAGES = [
  {
    id: 'printed-en',
    file: 'page-printed-en.json',
    fixture: {
      type: 'document',
      kind: 'printed',
      settings: { lang: 'en' },
      print: { paper: 'letter' },
      parentPages: [
        {
          type: 'parentPage',
          name: 'body',
          geometry: { margin: { blockStart: 18, blockEnd: 18, inlineStart: 20, inlineEnd: 20 } },
        },
      ],
      parentRules: [{ parent: 'body' }],
      children: [{ type: 'page', body: { html: printedLines('English composed line') } }],
    },
  },
  {
    id: 'printed-he',
    file: 'page-printed-he.json',
    fixture: {
      type: 'document',
      kind: 'printed',
      settings: { lang: 'he' },
      print: { paper: 'letter' },
      parentPages: [
        {
          type: 'parentPage',
          name: 'body',
          geometry: { margin: { blockStart: 18, blockEnd: 18, inlineStart: 20, inlineEnd: 20 } },
        },
      ],
      parentRules: [{ parent: 'body' }],
      children: [{ type: 'page', body: { html: printedLines('שורה מורכבת') } }],
    },
  },
] as const

export const PAGE_DEMO_PAGES = [
  { id: 'fluid', file: 'page.json', fixture: fluidPage },
  { id: 'rtl', file: 'page-rtl.json', fixture: hebrewPage },
  { id: 'markdown', file: 'page-markdown.json', fixture: markdownPage },
  { id: 'rtl-own-dir', file: 'page-rtl-own-dir.json', fixture: ownDirectionPage },
  { id: 'rtl-empty-dir', file: 'page-rtl-empty-dir.json', fixture: emptyDirectionPage },
  { id: 'rtl-div', file: 'page-rtl-div.json', fixture: rightToLeftDivPage },
  { id: 'fixed', file: 'page-fixed.json', fixture: fixedPage },
  { id: 'postcard', file: 'page-postcard.json', fixture: postcardPage },
] as const

// The page demo: each page fixture as JSON, and one host page showing them all, with the in-page link frames beside them.
export function buildPageDemo(site: string, shell: (body: string) => string): void {
  buildScriptedDependencyDemo(site, shell)
  for (const page of PAGE_DEMO_PAGES) writeFileSync(path.join(site, page.file), JSON.stringify(page.fixture))
  for (const page of PRINTED_PAGE_DEMO_PAGES) writeFileSync(path.join(site, page.file), JSON.stringify(page.fixture))
  writeFileSync(
    path.join(site, 'page.html'),
    shell(
      `<div style="background:#fff;max-width:900px">${PAGE_DEMO_PAGES.map(({ id, file }) => `<segnavia-page id="${id}" src="${file}"></segnavia-page>`).join('')}${PRINTED_PAGE_DEMO_PAGES.map(({ id, file }) => `<segnavia-page id="${id}" src="${file}" style="height:500px"></segnavia-page>`).join('')}${buildInPageLinkDemo(site)}</div>`,
    ),
  )
}
