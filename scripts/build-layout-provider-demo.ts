import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { bookFromDocument, type DocumentInput, PREFLIGHT_PRESETS } from '@segnavia/format'
import { bookValueDocument } from '@segnavia/frame/book-document'
import { newNonce } from '@segnavia/frame/bridge'
import { loadLayoutScripts } from '@segnavia/frame/layout'
import { parseDocument } from '@segnavia/html'
import type { Renderer } from '@segnavia/render'
import { alefCss, notoCss } from './demo-book-fonts.ts'
import { LAYOUT_DEMO_PROVIDER, LAYOUT_DEMO_REJECTING_PROVIDER, registerLayoutDemoProviders } from './layout-provider-demo-runtime.ts'

const prose = 'The compositor measures this steady paragraph before placing it on paper. '.repeat(18)

function bookFixture(marker: string): DocumentInput {
  const selected =
    marker === 'baseline'
      ? ''
      : ` data-segnavia-layout="${LAYOUT_DEMO_PROVIDER}"${marker === 'geometry' ? ' data-layout-geometry' : ` data-layout-phase="${marker}"`}`
  return {
    type: 'document',
    kind: 'book',
    metadata: { title: `Layout provider ${marker}` },
    mode: 'paginated',
    page: { paper: 'a6', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
    children: [
      {
        type: 'division',
        name: 'body',
        children: [
          {
            type: 'section',
            title: 'Provider fixture',
            children: [{ type: 'flow', html: `<p${selected}>${prose}</p><p data-layout-later>${prose}</p>` }],
          },
        ],
      },
    ],
  }
}

const measurementFixture: DocumentInput = {
  type: 'document',
  kind: 'book',
  metadata: { title: 'Layout provider measurements' },
  mode: 'paginated',
  settings: { lang: 'he' },
  page: { paper: 'a6', margin: { blockStart: 12, blockEnd: 12, inlineStart: 12, inlineEnd: 12 } },
  children: [
    {
      type: 'division',
      name: 'body',
      children: [
        {
          type: 'section',
          title: 'מדידה',
          children: [
            {
              type: 'flow',
              html: `<p dir="rtl" data-segnavia-layout="${LAYOUT_DEMO_PROVIDER}" data-layout-hebrew style="font:28px/1.5 NotoSerifHebrew,serif">בְּרֵאשִׁית<br>בראשית</p>`,
            },
          ],
        },
      ],
    },
  ],
}

async function bookHtml(input: DocumentInput, measure = false): Promise<string> {
  const book = bookFromDocument(parseDocument(input))
  const html = bookValueDocument(book, {
    nonce: newNonce(),
    profile: PREFLIGHT_PRESETS.default,
    fontCss: `${alefCss()}${notoCss()}`,
    layoutScripts: await loadLayoutScripts(JSON.stringify(input)),
  })
  return measure ? html.replace('"measure":false', '"measure":true') : html
}

export async function buildLayoutProviderDemo(root: string, site: string): Promise<void> {
  registerLayoutDemoProviders()
  for (const marker of ['baseline', 'galley', 'composed'] as const) {
    writeFileSync(path.join(site, `layout-provider-book-${marker}.html`), await bookHtml(bookFixture(marker)))
  }
  writeFileSync(path.join(site, 'layout-provider-book-measure.html'), await bookHtml(bookFixture('measure'), true))
  writeFileSync(path.join(site, 'layout-provider-book-geometry.html'), await bookHtml(bookFixture('geometry')))
  writeFileSync(path.join(site, 'layout-provider-book-hebrew.html'), await bookHtml(measurementFixture))

  const built = await Bun.build({
    entrypoints: [path.join(root, 'scripts/layout-provider-demo-browser.ts')],
    target: 'browser',
    format: 'esm',
    minify: true,
  })
  if (!built.success || !built.outputs[0]) throw new Error(`layout provider demo bundle failed: ${built.logs.join('\n')}`)
  writeFileSync(path.join(site, 'layout-provider-demo.js'), new Uint8Array(await built.outputs[0].arrayBuffer()))

  const geometry = `<main data-segnavia-layout="${LAYOUT_DEMO_PROVIDER}" data-layout-geometry style="margin:0;inline-size:400px;block-size:240px"></main>`
  const rejecting = `<main data-segnavia-layout="${LAYOUT_DEMO_REJECTING_PROVIDER}">reject</main>`
  writeFileSync(
    path.join(site, 'layout-provider-page.json'),
    JSON.stringify({
      type: 'document',
      kind: 'printed',
      print: { paper: 'letter' },
      parentPages: [{ type: 'parentPage', name: 'body', geometry: { margin: 12 } }],
      parentRules: [{ parent: 'body' }],
      children: [{ type: 'page', body: { html: geometry } }],
    }),
  )
  writeFileSync(
    path.join(site, 'layout-provider-page-reject.json'),
    JSON.stringify({ type: 'document', kind: 'page', size: { width: 400, height: 240 }, children: [{ type: 'page', body: { html: rejecting } }] }),
  )
  for (const [file, html] of [
    ['layout-provider-slide.json', geometry],
    ['layout-provider-slide-reject.json', rejecting],
  ] as const) {
    writeFileSync(
      path.join(site, file),
      JSON.stringify({ type: 'document', kind: 'deck', title: file, children: [{ type: 'slide', id: 'one', content: { kind: 'html', html } }] }),
    )
  }
  writeFileSync(
    path.join(site, 'layout-provider.html'),
    `<!doctype html><html><body><segnavia-page id="layout-page" src="layout-provider-page.json"></segnavia-page><segnavia-player id="layout-slide" src="layout-provider-slide.json"></segnavia-player><segnavia-page id="reject-page" src="layout-provider-page-reject.json"></segnavia-page><segnavia-player id="reject-slide" src="layout-provider-slide-reject.json"></segnavia-player><script>for(const id of ['reject-page','reject-slide'])document.getElementById(id).addEventListener('error',event=>event.currentTarget.dataset.error=event.error?.message||event.message||'')</script><script type="module" src="layout-provider-demo.js"></script></body></html>`,
  )
}

export async function buildLayoutProviderRenderDemo(site: string, renderer: Renderer): Promise<void> {
  const rejecting = `<main data-segnavia-layout="${LAYOUT_DEMO_REJECTING_PROVIDER}">reject</main>`
  const page: DocumentInput = {
    type: 'document',
    kind: 'page',
    size: { width: 400, height: 240 },
    children: [{ type: 'page', body: { html: rejecting } }],
  }
  const deck: DocumentInput = {
    type: 'document',
    kind: 'deck',
    title: 'Rejecting provider',
    children: [{ type: 'slide', id: 'one', content: { kind: 'html', html: rejecting } }],
  }
  const refusal = (operation: Promise<unknown>) =>
    operation.then(
      () => 'rendered',
      (error) => (error instanceof Error ? error.message : String(error)),
    )
  const facts = {
    page: await refusal(renderer.pagePdf(page)),
    slide: await refusal(renderer.deckPdf(deck)),
  }
  writeFileSync(path.join(site, 'layout-provider-render-refusals.json'), JSON.stringify(facts))
}
