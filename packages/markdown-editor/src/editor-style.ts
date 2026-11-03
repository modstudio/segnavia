export const EDITOR_CSS = `
:where(:host(segnavia-markdown-editor:not([unstyled]))){display:block}
:where(:host(segnavia-markdown-editor:not([unstyled])) [part~="editor"]){display:grid;grid-template-rows:auto minmax(0,1fr);min-block-size:0}
:where(:host(segnavia-markdown-editor:not([unstyled])) [part~="title"]){box-sizing:border-box;inline-size:100%}
:where(:host(segnavia-markdown-editor:not([unstyled])) [part~="source"]){min-inline-size:0;min-block-size:0}
:where(:host(segnavia-markdown-editor:not([unstyled])) [part~="source"] .cm-editor){block-size:100%}
:where(:host(segnavia-markdown-editor:not([unstyled])) [part~="rich"]){min-inline-size:0;min-block-size:0;overflow:auto}
:where(:host(segnavia-markdown-editor:not([unstyled])) [part~="rich"] .ProseMirror){min-block-size:100%;outline:0}
:where(:host(segnavia-markdown-editor:not([unstyled])) [part~="rich"] table){border-collapse:collapse;inline-size:max-content;min-inline-size:100%}
:where(:host(segnavia-markdown-editor:not([unstyled])) [part~="rich"] th),:where(:host(segnavia-markdown-editor:not([unstyled])) [part~="rich"] td){min-inline-size:1em}
:where(:host(segnavia-markdown-editor:not([unstyled])) [part~="rich"] [data-type="taskList"]){list-style:none;padding-inline-start:0}
:where(:host(segnavia-markdown-editor:not([unstyled])) [part~="rich"] [data-type="taskItem"]){display:grid;grid-template-columns:auto minmax(0,1fr);gap:var(--segnavia-markdown-task-gap,.5em)}
:where(:host(segnavia-markdown-editor:not([unstyled])) [part~="locked-block"]){display:block;position:relative;min-block-size:1em}
:where(:host(segnavia-markdown-editor:not([unstyled])) [part~="locked-block"] segnavia-page){display:block}
`

export function ensureEditorStyle(element: Element) {
  const root = element.getRootNode()
  const target = root instanceof ShadowRoot ? root : document.head
  if (target.querySelector('style[data-segnavia-markdown-editor]')) return
  const style = document.createElement('style')
  style.dataset.segnaviaMarkdownEditor = ''
  style.textContent = EDITOR_CSS
  target.prepend(style)
}
