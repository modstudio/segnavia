import type { FontReference } from '@segnavia/format'
import { createPageElement, HEADLESS_ELEMENTS, SegnaviaPage } from '@segnavia/frame'
import type { FontsOptions } from '@segnavia/frame/fonts'
import { safeMarkdownUrl } from '@segnavia/html'
import { Editor, type JSONContent } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import { type RichEditorState, richEditorState, richKeyboard } from './markdown-rich-commands.ts'
import { richExtensions } from './markdown-rich-extensions.ts'
import { LOCKED_BLOCK_NAME, LockedBlock } from './markdown-rich-locked.ts'
import { RAW_INLINE_NAME, RawInline } from './markdown-rich-raw-inline.ts'

if (!customElements.get(HEADLESS_ELEMENTS.page)) customElements.define(HEADLESS_ELEMENTS.page, SegnaviaPage)

type LockedViewOptions = {
  alertLabels?: Record<string, string>
  css: () => string
  fontReferences: FontReference[]
  fonts?: FontsOptions
}

function lockedView(options: () => LockedViewOptions) {
  return LockedBlock.extend({
    addNodeView() {
      return ({ node }) => {
        const dom = document.createElement('div')
        dom.part.add('locked-block')
        dom.dir = 'auto'
        dom.contentEditable = 'false'
        const label = typeof node.attrs.label === 'string' ? node.attrs.label : null
        if (label) {
          dom.dataset.lockedLabel = label
          const text = document.createElement('span')
          text.dir = 'auto'
          text.textContent = label
          dom.append(text)
        } else {
          const page = createPageElement()
          const current = options()
          page.css = current.css()
          page.fonts = current.fonts
          page.alertLabels = current.alertLabels
          page.page = { markdown: String(node.attrs.source ?? ''), scripts: 'refuse', fonts: current.fontReferences }
          dom.append(page)
        }
        return { dom }
      }
    },
  })
}

const rawInlineView = RawInline.extend({
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span')
      dom.part.add('raw-inline')
      dom.dataset.rawInline = ''
      dom.dataset.rawSource = String(node.attrs.source ?? '')
      dom.dataset.rawDisplay = String(node.attrs.display ?? '')
      dom.dir = 'auto'
      dom.contentEditable = 'false'
      dom.title = String(node.attrs.source ?? '')
      dom.textContent = String(node.attrs.display ?? '')
      return { dom }
    }
  },
})

function extensions(options: () => LockedViewOptions, keyboard: Parameters<typeof richKeyboard>[0]) {
  return [
    ...richExtensions().map((extension) => {
      if (extension.name === LOCKED_BLOCK_NAME) return lockedView(options)
      return extension.name === RAW_INLINE_NAME ? rawInlineView : extension
    }),
    richKeyboard(keyboard),
  ]
}

function pastedHtml(html: string, linkOrigins: Iterable<string> | undefined): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  for (const link of parsed.querySelectorAll('a[href]')) {
    if (safeMarkdownUrl('href', link.getAttribute('href') ?? '', linkOrigins)) continue
    link.replaceWith(...link.childNodes)
  }
  for (const image of parsed.querySelectorAll('img[src]')) if (!safeMarkdownUrl('src', image.getAttribute('src') ?? '')) image.remove()
  for (const active of parsed.querySelectorAll('script,style,iframe,object,embed')) active.remove()
  return parsed.body.innerHTML
}

export type RichAdapterOptions = LockedViewOptions & {
  content: JSONContent[]
  editLocked: () => boolean
  linkOrigins: () => Iterable<string> | undefined
  linkRequest: (href: string | null) => void
  mount: HTMLElement
  change: (content: readonly Node[]) => void
  save: () => void
  state: (state: RichEditorState) => void
  toggleMode: () => boolean
}

export function mountRichEditor(options: RichAdapterOptions): Editor {
  const current = () => options
  const editor = new Editor({
    element: options.mount,
    injectCSS: false,
    extensions: extensions(current, options),
    content: { type: 'doc', content: options.content },
    editorProps: {
      attributes: { 'aria-label': 'Markdown body' },
      handleDOMEvents: {
        click: (_view, event) => {
          if (event.target instanceof Element && event.target.closest('a')) event.preventDefault()
          return false
        },
      },
      transformPastedHTML: (html) => pastedHtml(html, options.linkOrigins()),
    },
    onUpdate: ({ editor: instance }) => options.change(Array.from(instance.state.doc.content.content)),
    onTransaction: ({ editor: instance }) => options.state(richEditorState(instance)),
    onSelectionUpdate: ({ editor: instance }) => options.state(richEditorState(instance)),
  })
  options.state(richEditorState(editor))
  return editor
}
