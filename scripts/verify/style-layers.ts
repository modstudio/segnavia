import { frameDocument } from '@segnavia/frame/bridge'
import { compileStyleSheet } from '@segnavia/html'
import type { StyleSheet } from '@segnavia/format'
import type { Harness } from './harness.ts'

const BRAND = '#112233'
const DOCUMENT = '#224466'
const AUTHOR = '#336699'
const HOST = '#4488cc'

function compiled(brand: StyleSheet, document: StyleSheet): string[] {
  const result = compileStyleSheet({ brand, document, dir: 'ltr' })
  if (!result.ok) throw new Error(result.refusal)
  return result.sheets
}

async function computedColor(h: Harness, brand: StyleSheet, document: StyleSheet, hostCss?: string): Promise<string> {
  const srcdoc = frameDocument('<p id="probe" class="segnavia-style-probe">Layered</p>', {
    scripts: 'refuse',
    nonce: 'style-layers',
    sheets: compiled(brand, document),
    css: hostCss,
  })
  await h.page.setContent('<iframe id="style-frame" sandbox="allow-scripts"></iframe>')
  await h.page.locator('#style-frame').evaluate(
    (frame, documentText) =>
      new Promise<void>((resolve) => {
        const ready = (event: MessageEvent) => {
          if (event.source !== (frame as HTMLIFrameElement).contentWindow || event.data?.type !== 'segnavia:ready') return
          removeEventListener('message', ready)
          resolve()
        }
        addEventListener('message', ready)
        ;(frame as HTMLIFrameElement).srcdoc = documentText
      }),
    srcdoc,
  )
  return h.page.frameLocator('#style-frame').locator('#probe').evaluate((element) => getComputedStyle(element).color)
}

const textStyle = (color: string): StyleSheet => ({ textStyles: { probe: { kind: 'paragraph', color } } })

export async function verifyStyleLayers(h: Harness): Promise<void> {
  const brand = textStyle(BRAND)
  const document = textStyle(DOCUMENT)
  const author = { ...document, css: `.segnavia-style-probe{color:${AUTHOR}}` }
  const cases = [
    ['brand style wins alone', await computedColor(h, brand, {}), 'rgb(17, 34, 51)'],
    ['document style beats brand style', await computedColor(h, brand, document), 'rgb(34, 68, 102)'],
    ['author CSS beats document style', await computedColor(h, brand, author), 'rgb(51, 102, 153)'],
    ['unlayered host CSS beats author CSS', await computedColor(h, brand, author, `.segnavia-style-probe{color:${HOST}}`), 'rgb(68, 136, 204)'],
  ] as const
  for (const [name, actual, expected] of cases) h.check(name, actual === expected, actual)
  const isolated = await computedColor(h, { css: 'a{content:"x' }, document)
  h.check('an unfinished brand string cannot consume the document sheet', isolated === 'rgb(34, 68, 102)', isolated)
}
