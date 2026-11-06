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

<script>globalThis.lockedAuthorScript = true</script><aside>Raw HTML</aside>

<!-- carried comment -->

[spec]: https://example.com/spec

| Name | Value |
| --- | --- |
| One | 1 |

- [ ] Task

![Picture](https://example.com/p.png)

English line.

Opaque [spec].

שורה בעברית.`
  const markdownScriptValue = JSON.stringify(markdown).replaceAll('<', '\\u003c')
  const result = await Bun.build({
    entrypoints: [path.join(root, 'packages/markdown-editor/src/markdown-editor.ts')],
    outdir: site,
    naming: { entry: 'segnavia-markdown-editor.js', chunk: 'segnavia-markdown-editor-[hash].[ext]' },
    splitting: true,
    target: 'browser',
    minify: true,
  })
  if (!result.success) throw new Error(`The markdown editor demo bundle failed: ${result.logs.join('\n')}`)
  writeFileSync(
    path.join(site, 'markdown-editor.html'),
    `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;margin:24px}segnavia-markdown-editor{display:block;block-size:360px}#raw-inline-tooltip{position:fixed;z-index:1;padding:.25rem .5rem;background:CanvasText;color:Canvas;border-radius:.25rem;inset-inline-start:var(--tooltip-inline);inset-block-start:var(--tooltip-block)}</style></head><body>
      <form id="editor-form"><segnavia-markdown-editor id="editor"></segnavia-markdown-editor></form>
      <div id="raw-inline-tooltip" role="tooltip" dir="auto" hidden></div>
      <script type="module">
        import './segnavia-markdown-editor.js'
        const editor = document.getElementById('editor')
        globalThis.editorEvents = { markdown: [], title: [], modes: [], states: [], links: [], rawInline: [], saves: 0, submits: 0, original: ${markdownScriptValue} }
        document.getElementById('editor-form').addEventListener('submit', event => {
          event.preventDefault()
          globalThis.editorEvents.submits++
        })
        editor.addEventListener('segnavia-markdown-change', event => globalThis.editorEvents.markdown.push(event.detail.markdown))
        editor.addEventListener('segnavia-title-change', event => globalThis.editorEvents.title.push(event.detail.title))
        editor.addEventListener('segnavia-mode-change', event => globalThis.editorEvents.modes.push(event.detail.mode))
        editor.addEventListener('segnavia-editor-state', event => globalThis.editorEvents.states.push(event.detail))
        editor.addEventListener('segnavia-link-request', event => globalThis.editorEvents.links.push(event.detail.href))
        editor.addEventListener('segnavia-raw-inline-indicate', event => {
          globalThis.editorEvents.rawInline.push(event.detail)
          const tooltip = document.getElementById('raw-inline-tooltip')
          tooltip.hidden = !event.detail
          if (!event.detail) return
          tooltip.textContent = event.detail.source
          tooltip.style.setProperty('--tooltip-inline', event.detail.rect.x + 'px')
          tooltip.style.setProperty('--tooltip-block', event.detail.rect.y + event.detail.rect.height + 'px')
        })
        editor.addEventListener('segnavia-save', () => globalThis.editorEvents.saves++)
        editor.titleSource = 'leading-heading'
        editor.lockedFences = { articles: 'Generated list' }
        editor.markdown = ${markdownScriptValue}
      </script>
    </body></html>`,
  )
}
