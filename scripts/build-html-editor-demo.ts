import { writeFileSync } from 'node:fs'
import path from 'node:path'

export async function buildHtmlEditorDemo(root: string, site: string): Promise<void> {
  const result = await Bun.build({
    entrypoints: [path.join(root, 'packages/html-editor/src/html-editor.ts')],
    outdir: site,
    naming: { entry: 'segnavia-html-editor.js', chunk: 'segnavia-html-editor-[hash].[ext]' },
    splitting: true,
    target: 'browser',
    minify: true,
  })
  if (!result.success) throw new Error(`The HTML editor demo bundle failed: ${result.logs.join('\n')}`)
  writeFileSync(
    path.join(site, 'html-editor.html'),
    `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;margin:24px}segnavia-html-editor{display:block;block-size:240px}</style></head><body>
      <div id="mount"></div>
      <script type="module">
        const { SegnaviaHtmlEditor } = await import('./segnavia-html-editor.js')
        const editor = new SegnaviaHtmlEditor()
        editor.id = 'editor'
        globalThis.htmlEditorEvents = { changes: [] }
        editor.addEventListener('segnavia-html-change', event => globalThis.htmlEditorEvents.changes.push(event.detail.html))
        editor.profile = {
          blocks: { p: true },
          marks: ['bold'],
          atoms: { pattern: 'double-brace' },
        }
        editor.html = '<p>Welcome {{first_name}}</p>'
        document.getElementById('mount').append(editor)
      </script>
    </body></html>`,
  )
}
