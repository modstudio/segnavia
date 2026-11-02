import { writeFileSync } from 'node:fs'
import path from 'node:path'

export async function buildMarkdownEditorDemo(root: string, site: string): Promise<void> {
  const markdown = '# Original title\n\nEnglish line.\nשורה בעברית.'
  const result = await Bun.build({
    entrypoints: [path.join(root, 'packages/frame/src/markdown-editor.ts')],
    outdir: site,
    naming: 'segnavia-markdown-editor.js',
    target: 'browser',
    minify: true,
  })
  if (!result.success) throw new Error(`The markdown editor demo bundle failed: ${result.logs.join('\n')}`)
  writeFileSync(
    path.join(site, 'markdown-editor.html'),
    `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;margin:24px}segnavia-markdown-editor{display:block;block-size:360px}</style></head><body>
      <segnavia-markdown-editor id="editor"></segnavia-markdown-editor>
      <script type="module">
        import './segnavia-markdown-editor.js'
        const editor = document.getElementById('editor')
        globalThis.editorEvents = { markdown: [], title: [], saves: 0 }
        editor.addEventListener('segnavia-markdown-change', event => globalThis.editorEvents.markdown.push(event.detail.markdown))
        editor.addEventListener('segnavia-title-change', event => globalThis.editorEvents.title.push(event.detail.title))
        editor.addEventListener('segnavia-save', () => globalThis.editorEvents.saves++)
        editor.titleSource = 'leading-heading'
        editor.markdown = ${JSON.stringify(markdown)}
      </script>
    </body></html>`,
  )
}
