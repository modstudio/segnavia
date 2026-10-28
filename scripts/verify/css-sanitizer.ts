import { sanitize } from '@segnavia/html'
import type { Harness } from './harness.ts'

const CORPUS = [
  '<style>@import "http://probe.test/import.css";#kept{color:rgb(1, 2, 3)}</style><p id="kept">kept</p>',
  '<style>.q{background:url(http://probe.test/plain.png)}#kept{color:rgb(1, 2, 3)}</style><p id="kept">kept</p>',
  String.raw`<style>.q{background:u\72l(http://probe.test/escaped-name.png)}#kept{color:rgb(1, 2, 3)}</style><p id="kept">kept</p>`,
  String.raw`<style>.q{background:url(http\3a //probe.test/escaped-value.png)}#kept{color:rgb(1, 2, 3)}</style><p id="kept">kept</p>`,
  '<style>.q{background:image-set("http://probe.test/set.png" 1x)}#kept{color:rgb(1, 2, 3)}</style><p id="kept">kept</p>',
  '<style>.q{background:-webkit-image-set("http://probe.test/webkit-set.png" 1x)}#kept{color:rgb(1, 2, 3)}</style><p id="kept">kept</p>',
  '<style>@font-face{font-family:x;src:url(http://probe.test/font.woff2)}.q{font-family:x}#kept{color:rgb(1, 2, 3)}</style><p id="kept">kept</p>',
  '<style>.q{background:u/**/rl(http://probe.test/comment.png)}#kept{color:rgb(1, 2, 3)}</style><p id="kept">kept</p>',
  '<style>.q{background:url(bad"http://probe.test/bad-url.png)}#kept{color:rgb(1, 2, 3)}</style><p id="kept">kept</p>',
  '<style>p{content:"a\n} .q{background:url(http://probe.test/badstring.png)} .r{content:"}#kept{color:rgb(1, 2, 3)}</style><p id="kept">kept</p>',
  `<p id="kept" style="color:rgb(1, 2, 3);content:'a\n;background:url(http://probe.test/badattr.png);x:'">kept</p>`,
  '<style>@media (min-width:1px){.q{background:url(http://probe.test/nested.png)}#kept{color:rgb(1, 2, 3)}}</style><p id="kept">kept</p>',
  '<style>.q{background:url(data:image/png;base64,AA==)}#kept{color:rgb(1, 2, 3)}</style><p id="kept">kept</p>',
  '<style>.q{background:image-set(url(data:image/png;base64,AA==) 1x)}#kept{color:rgb(1, 2, 3)}</style><p id="kept">kept</p>',
  '<style>@media print{@page{@top-center{content:"Page"}}#print-sibling{color:rgb(4, 5, 6)}}</style><p id="print-sibling">print sibling</p>',
] as const

export async function verifyCssSanitizer(h: Harness) {
  const { page, check } = h
  const requests: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (!url.startsWith('data:') && !url.startsWith('about:') && !url.startsWith('blob:')) requests.push(url)
  })
  await page.route('**/*', (route) => route.abort())

  for (const dataFonts of [false, true]) {
    for (const [index, source] of CORPUS.entries()) {
      requests.length = 0
      const isolated = source.replaceAll('probe.test/', `probe.test/${dataFonts ? 'fonts-on' : 'fonts-off'}/`)
      await page.setContent(sanitize(`${isolated}<div class="q">fetch probe</div>`, { dataFonts }), { waitUntil: 'load' })
      await page.waitForTimeout(20)
      check(`CSS sanitizer corpus ${index + 1} makes no non-data request with dataFonts=${dataFonts}`, requests.length === 0, requests.join(', '))
    }
  }

  await page.setContent(sanitize('<style>#kept{color:rgb(1, 2, 3);font-weight:700}</style><p id="kept">kept</p>'))
  const kept = await page.locator('#kept').evaluate((element) => {
    const style = getComputedStyle(element)
    return { color: style.color, weight: style.fontWeight }
  })
  check('a safe rule is applied after sanitizing', kept.color === 'rgb(1, 2, 3)' && kept.weight === '700', JSON.stringify(kept))

  await page.setContent(sanitize(CORPUS.at(-1) ?? ''))
  const printSibling = await page.locator('#print-sibling').evaluate((element) => getComputedStyle(element).color)
  check('a sibling stays inside its unmatched print media rule', printSibling !== 'rgb(4, 5, 6)', printSibling)
}
