import { writeFileSync } from 'node:fs'
import path from 'node:path'

export async function buildMarkdownEditorDemo(root: string, site: string): Promise<void> {
  const markdown = `# Original title

---
draft: true
---

:::audience{name=builders}
Directive body.
:::

\`\`\`mermaid
flowchart LR
A-->B
\`\`\`

\`\`\`articles
Generated source.
\`\`\`

> [!NOTE]
> Keep this alert.

<aside>Raw HTML</aside>

<!-- carried comment -->

[spec]: https://example.com/spec

| Name | Value |
| --- | --- |
| One | 1 |

- [ ] Task

![Picture](https://example.com/p.png)

English line.

שורה בעברית.`
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
      <form id="editor-form"><segnavia-markdown-editor id="editor"></segnavia-markdown-editor></form>
      <script type="module">
        import './segnavia-markdown-editor.js'
        const editor = document.getElementById('editor')
        globalThis.editorEvents = { markdown: [], title: [], modes: [], states: [], links: [], saves: 0, submits: 0, original: ${JSON.stringify(markdown)} }
        document.getElementById('editor-form').addEventListener('submit', event => {
          event.preventDefault()
          globalThis.editorEvents.submits++
        })
        editor.addEventListener('segnavia-markdown-change', event => globalThis.editorEvents.markdown.push(event.detail.markdown))
        editor.addEventListener('segnavia-title-change', event => globalThis.editorEvents.title.push(event.detail.title))
        editor.addEventListener('segnavia-mode-change', event => globalThis.editorEvents.modes.push(event.detail.mode))
        editor.addEventListener('segnavia-editor-state', event => globalThis.editorEvents.states.push(event.detail))
        editor.addEventListener('segnavia-link-request', event => globalThis.editorEvents.links.push(event.detail.href))
        editor.addEventListener('segnavia-save', () => globalThis.editorEvents.saves++)
        editor.titleSource = 'leading-heading'
        editor.lockedFences = { articles: 'Generated list' }
        editor.markdown = ${JSON.stringify(markdown)}
      </script>
    </body></html>`,
  )
}
