import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'
import { screenPage } from '../screen-document.ts'

export async function verifyDependencyRender(
  renderer: Renderer,
  work: string,
  refusal: (work: Promise<unknown>) => Promise<string>,
  check: (what: string, ok: boolean, detail?: string) => void,
) {
  const url = 'https://cdn.jsdelivr.net/npm/segnavia-render-stub@1.2.3/index.js'
  const page = screenPage(
    { html: `<p id="result">waiting</p><script src="${url}"></script>` },
    { settings: { scripts: 'sandboxed' }, size: { width: 400, height: 200 } },
  )
  const pdf = await renderer.pagePdf(page, {
    origins: [{ origin: 'https://cdn.jsdelivr.net', kinds: ['script'] }],
    assets: async (request) =>
      request === url
        ? { body: new TextEncoder().encode("document.getElementById('result').textContent='cache seam worked';pageReady()"), contentType: 'text/javascript' }
        : undefined,
  })
  const file = path.join(work, 'dependency.pdf')
  writeFileSync(file, pdf)
  check(
    'an offline render fulfills an approved scripted dependency from the host cache',
    execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' }).includes('cache seam worked'),
  )
  const missing = await refusal(renderer.pagePdf(page, { origins: [{ origin: 'https://cdn.jsdelivr.net', kinds: ['script'] }], waitForPageReady: false }))
  check('an approved dependency without a cache answer is refused by URL', missing.includes(url), missing)
  const lateUrl = 'https://cdn.jsdelivr.net/npm/segnavia-render-stub@1.2.3/late.js'
  const late = await refusal(
    renderer.pagePdf(
      screenPage(
        { html: `<script>setTimeout(function(){import('${lateUrl}').finally(function(){pageReady()})},0)</script>` },
        {
          settings: { scripts: 'sandboxed' },
          size: { width: 400, height: 200 },
        },
      ),
      { origins: [{ origin: 'https://cdn.jsdelivr.net', kinds: ['script'] }] },
    ),
  )
  check('an approved dependency requested after load without a cache answer is refused by URL', late.includes(lateUrl), late)

  const unapprovedImage = 'https://unapproved.example/image.png'
  let unapprovedLookups = 0
  const unapproved = await refusal(
    renderer.pagePdf(screenPage({ html: `<img src="${unapprovedImage}">` }, { size: { width: 400, height: 200 } }), {
      assets: async () => {
        unapprovedLookups++
        return undefined
      },
    }),
  )
  check(
    'an unapproved markup image refuses before CSP can hide it',
    unapproved.includes(unapprovedImage) && unapproved.includes('origin https://unapproved.example') && unapproved.includes('image') && unapproved.includes('origins'),
    unapproved,
  )
  check('an unapproved markup image never reaches the host asset seam', unapprovedLookups === 0, String(unapprovedLookups))

  const fontCssUrl = 'https://fonts.googleapis.com/css2?family=Noto+Serif+Hebrew'
  const fontUrl = 'https://fonts.gstatic.com/s/notoserifhebrew/v1/hebrew.ttf'
  const markedHebrew = 'שָׁלוֹם'
  const hebrew = await renderer.pagePdf(
    screenPage({ html: `<link rel="stylesheet" href="${fontCssUrl}"><p lang="he">${markedHebrew}</p>` }, { size: { width: 400, height: 200 } }),
    {
      assets: async (request) => {
        if (request === fontCssUrl) {
          return { body: new TextEncoder().encode(`@font-face{font-family:Noto;src:url(${fontUrl})}p{font-family:Noto}`), contentType: 'text/css' }
        }
        if (request === fontUrl) {
          return {
            body: readFileSync(path.join(import.meta.dirname, '../../fixtures/hebrew-notice/NotoSerifHebrew-Regular.ttf')),
            contentType: 'font/ttf',
          }
        }
      },
    },
  )
  const hebrewFile = path.join(work, 'google-fonts-hebrew.pdf')
  writeFileSync(hebrewFile, hebrew)
  const extracted = execFileSync('pdftotext', [hebrewFile, '-'], { encoding: 'utf8' }).normalize('NFD')
  check('an offline Google Fonts render keeps every Hebrew mark', extracted.includes(markedHebrew.normalize('NFD')), extracted)
}
