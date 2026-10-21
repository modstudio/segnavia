import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { PageInput, PrintInput } from '@segnavia/format'

export const brochurePrint: PrintInput = { paper: 'a4', orientation: 'portrait' }
export const businessCardPrint: PrintInput = { paper: 'business-card-us', orientation: 'landscape' }

export const brochurePages: PageInput[] = [
  {
    id: 'cover',
    html: '<!doctype html><html style="background:#17324d"><body style="margin:0;height:100vh;display:grid;place-items:center;color:#fff;font:32px Georgia,serif;text-align:center"><main><p style="letter-spacing:.2em;text-transform:uppercase">Segnavia</p><h1 style="font-size:72px;margin:.2em">Designed pages</h1><p>A two-page A4 brochure</p></main></body></html>',
  },
  {
    id: 'inside',
    html: '<!doctype html><html style="background:#f5e9d5"><body style="margin:0;height:100vh;display:grid;grid-template-columns:1fr 1fr;color:#17324d;font:28px Georgia,serif"><section style="padding:72px"><h2>One paper size</h2><p>Every page keeps its own design while the document keeps its order.</p></section><section style="padding:72px;background:#d27550;color:#fff"><h2>Ready to print</h2><p>The same pages can go through the browser print path.</p></section></body></html>',
  },
]

export const businessCardPages: PageInput[] = [
  {
    html: '<!doctype html><html style="background:#fff"><body style="box-sizing:border-box;margin:0;height:100vh;padding:18px;border:8px solid #17324d;display:flex;justify-content:space-between;align-items:end;color:#17324d;font:14px system-ui"><strong style="font-size:22px">Segnavia</strong><span>Designed pages</span></body></html>',
  },
]

export async function buildDocumentDemo(root: string, site: string): Promise<void> {
  writeFileSync(
    path.join(site, 'document.html'),
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>html,body{margin:0}body{padding:32px;background:#e7e7e4;font:14px system-ui;color:#333}h2{margin-block:48px 16px}.viewer{max-inline-size:900px}#card{max-inline-size:520px}segnavia-thumbnail{display:block;inline-size:240px;margin-block:24px}</style></head><body>
    <h1>Documents</h1><h2>A4 brochure</h2><segnavia-thumbnail id="cover-thumbnail"></segnavia-thumbnail><segnavia-document id="brochure" class="viewer"></segnavia-document>
    <h2>Business card</h2><segnavia-document id="card" class="viewer"></segnavia-document>
    <script type="module" src="segnavia.js"></script><script type="module">
      await customElements.whenDefined('segnavia-document')
      const brochurePages = ${JSON.stringify(brochurePages)}
      const brochurePrint = ${JSON.stringify(brochurePrint)}
      document.getElementById('brochure').load(brochurePages, brochurePrint)
      document.getElementById('card').load(${JSON.stringify(businessCardPages)}, ${JSON.stringify(businessCardPrint)})
      const cover = document.getElementById('cover-thumbnail')
      cover.print = brochurePrint
      cover.page = brochurePages[0]
    </script><script type="module" src="document-authoring-demo.js"></script></body></html>`,
  )
  const built = await Bun.build({ entrypoints: [path.join(root, 'fixtures', 'document-authoring-demo.ts')], target: 'browser', format: 'esm', minify: true })
  if (!built.success || !built.outputs[0]) throw new Error(`Could not build document authoring demo: ${built.logs.join('\n')}`)
  await Bun.write(path.join(site, 'document-authoring-demo.js'), built.outputs[0])
}
