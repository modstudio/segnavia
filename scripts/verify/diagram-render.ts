import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DocumentInput } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { screenPage } from '../screen-document.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const GOOD_SOURCE = 'flowchart LR\n  A[התחלה] --> B[סוף]'
const BROKEN_SOURCE = 'flowchart LR\n  broken[[[ -->'
const diagramHtml = (source: string) => `<pre data-segnavia-diagram="mermaid"><code>${source}</code></pre>`

function pdfText(work: string, name: string, bytes: Uint8Array): string {
  const file = path.join(work, name)
  writeFileSync(file, bytes)
  return execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' })
}

export async function verifyDiagramRender(renderer: Renderer, work: string, check: Check): Promise<void> {
  const page = await renderer.pagePdf(
    screenPage({ markdown: `# Diagram\n\n\`\`\`mermaid\n${GOOD_SOURCE}\n\`\`\`` }, { print: { paper: 'a5', orientation: 'portrait' } }),
    { effects: false },
  )
  const pageText = pdfText(work, 'diagram-page.pdf', page)
  check('pagePdf waits for a Hebrew-labeled diagram', pageText.includes('התחלה'), pageText.trim())

  const broken = await renderer.pagePdf(screenPage({ markdown: `\`\`\`mermaid\n${BROKEN_SOURCE}\n\`\`\`` }), { effects: false })
  const brokenText = pdfText(work, 'diagram-broken.pdf', broken)
  check(
    'a broken diagram renders its source and first parser message line',
    brokenText.includes('broken[[[ -->') && brokenText.includes('Parse error on line 2:'),
    brokenText.trim(),
  )

  const document: DocumentInput = {
    type: 'document',
    kind: 'book',
    metadata: { title: 'Diagram book' },
    mode: 'continuous',
    page: { paper: 'a5', margin: { blockStart: 12, blockEnd: 12, inlineStart: 15, inlineEnd: 10 } },
    children: [
      { type: 'division', name: 'body', children: [{ type: 'section', title: 'Chapter', children: [{ type: 'flow', html: diagramHtml(GOOD_SOURCE) }] }] },
    ],
  }
  const book = await renderer.bookPdf(document, { effects: false })
  const bookText = pdfText(work, 'diagram-book.pdf', book)
  check('a continuous book waits for a Hebrew-labeled diagram', bookText.includes('התחלה'), bookText.trim())
}
