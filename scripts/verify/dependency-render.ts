import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'

export async function verifyDependencyRender(
  renderer: Renderer,
  work: string,
  refusal: (work: Promise<unknown>) => Promise<string>,
  check: (what: string, ok: boolean, detail?: string) => void,
) {
  const url = 'https://cdn.jsdelivr.net/npm/segnavia-render-stub@1.2.3/index.js'
  const page = { html: `<p id="result">waiting</p><script src="${url}"></script>`, scripts: 'sandboxed' as const, size: { width: 400, height: 200 } }
  const pdf = await renderer.pagePdf(page, {
    dependencyOrigins: ['https://cdn.jsdelivr.net'],
    dependencies: async (request) =>
      request === url
        ? { body: new TextEncoder().encode("document.getElementById('result').textContent='cache seam worked';pageReady()"), contentType: 'text/javascript' }
        : undefined,
  })
  const file = path.join(work, 'dependency.pdf')
  writeFileSync(file, pdf)
  check(
    'an offline render fulfils an approved scripted dependency from the host cache',
    execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' }).includes('cache seam worked'),
  )
  const missing = await refusal(renderer.pagePdf(page, { dependencyOrigins: ['https://cdn.jsdelivr.net'], waitForPageReady: false }))
  check('an approved dependency without a cache answer is refused by URL', missing.includes(url), missing)
  const lateUrl = 'https://cdn.jsdelivr.net/npm/segnavia-render-stub@1.2.3/late.js'
  const late = await refusal(
    renderer.pagePdf(
      {
        html: `<script>setTimeout(function(){import('${lateUrl}').finally(function(){pageReady()})},0)</script>`,
        scripts: 'sandboxed',
        size: { width: 400, height: 200 },
      },
      { dependencyOrigins: ['https://cdn.jsdelivr.net'] },
    ),
  )
  check('an approved dependency requested after load without a cache answer is refused by URL', late.includes(lateUrl), late)
}
