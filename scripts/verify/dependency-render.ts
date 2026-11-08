import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'
import { screenPage } from '../screen-document.ts'
import { pngPixels } from './browser-pixels.ts'

const nfdCodePointMultiset = (value: string) => [...value.normalize('NFD').replace(/[\s\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, '')].sort().join('')
const redPng = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGO4IyIHRwzEcQDC4xDhSCTDUgAAAABJRU5ErkJggg==', 'base64'))

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
    unapproved.includes(unapprovedImage) &&
      unapproved.includes('origin https://unapproved.example') &&
      unapproved.includes('image') &&
      unapproved.includes('origins'),
    unapproved,
  )
  check('an unapproved markup image never reaches the host asset seam', unapprovedLookups === 0, String(unapprovedLookups))

  const imageOrigin = 'https://images.example'
  const image = `${imageOrigin}/asset.png`
  const imagePage = screenPage(
    { html: `<style>body{margin:0}<\/style><img src="${image}" style="width:40px;height:40px;image-rendering:pixelated">` },
    { size: { width: 400, height: 200 } },
  )
  const imageOptions = {
    origins: [{ origin: imageOrigin, kinds: ['image'] as const }],
    assets: async (request: string) => (request === image ? { body: redPng, contentType: 'image/png' } : undefined),
  }
  const approvedImage = await pngPixels(renderer, await renderer.pageImage(imagePage, { ...imageOptions, format: 'png' }))
  const sample = approvedImage.rgba.slice((20 * approvedImage.width + 20) * 4, (20 * approvedImage.width + 20) * 4 + 4)
  check(
    'an approved host image is fulfilled offline and drawn into the rendered pixels',
    sample[0] === 220 && sample[1] === 20 && sample[2] === 30 && sample[3] === 255,
    `sample=${sample.join(',')}`,
  )
  const cappedOptions = {
    ...imageOptions,
    limits: { assets: { each: redPng.byteLength - 1 } },
  }
  const pageCap = await refusal(renderer.pagePdf(imagePage, cappedOptions))
  check('pagePdf carries a lowered per-asset cap into its inner render', pageCap.includes('limits.assets.each') && pageCap.includes(image), pageCap)
  const pagesCap = await refusal(renderer.pagesPdf([imagePage], cappedOptions))
  check('pagesPdf carries a lowered per-asset cap into its inner render', pagesCap.includes('limits.assets.each') && pagesCap.includes(image), pagesCap)

  const secondImage = `${imageOrigin}/second.png`
  const documentCap = await refusal(
    renderer.pagesPdf([imagePage, screenPage({ html: `<img src="${secondImage}">` }, { size: { width: 400, height: 200 } })], {
      origins: cappedOptions.origins,
      assets: async (request) => (request === image || request === secondImage ? { body: redPng, contentType: 'image/png' } : undefined),
      limits: { assets: { each: redPng.byteLength, bytes: redPng.byteLength * 2 - 1 } },
    }),
  )
  check(
    'asset bytes accumulate across every tab in one document',
    documentCap.includes('limits.assets.bytes') && documentCap.includes(secondImage),
    documentCap,
  )
  const raisedLimits = { assets: { each: redPng.byteLength + 1, bytes: redPng.byteLength * 2 + 1 } }
  const raisedAssetCap = await refusal(renderer.pagePdf(imagePage, { ...imageOptions, limits: raisedLimits }))
  check('a raised host asset cap admits the formerly capped image', raisedAssetCap === 'rendered', raisedAssetCap)
  const raisedDocumentCap = await refusal(
    renderer.pagesPdf([imagePage, screenPage({ html: `<img src="${secondImage}">` }, { size: { width: 400, height: 200 } })], {
      origins: imageOptions.origins,
      assets: async (request) => (request === image || request === secondImage ? { body: redPng, contentType: 'image/png' } : undefined),
      limits: raisedLimits,
    }),
  )
  check('a raised host document asset cap admits both images', raisedDocumentCap === 'rendered', raisedDocumentCap)
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
  const extracted = execFileSync('pdftotext', [hebrewFile, '-'], { encoding: 'utf8' })
  check('an offline Google Fonts render keeps every Hebrew mark', nfdCodePointMultiset(extracted) === nfdCodePointMultiset(markedHebrew), extracted)
}
