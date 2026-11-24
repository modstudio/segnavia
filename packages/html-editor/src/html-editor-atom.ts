import { resolveDirection } from '@segnavia/format'
import { DOUBLE_BRACE_ATOM_NAME, DOUBLE_BRACE_ATOM_TOKEN } from '@segnavia/html'
import { type Editor, Node as TiptapNode } from '@tiptap/core'

export const HTML_ATOM_NAME = 'atom'
export const HTML_ATOM_ATTRIBUTE = 'data-html-atom'

export interface HtmlAtomOptions {
  draw: (name: string) => globalThis.Node | string | undefined
  error: (name: string, reason: unknown) => void
  label: (name: string) => string
}

function directionContext(editor: Editor, position: number): { dir: 'ltr' | 'rtl' | undefined; lang: string | undefined } {
  const resolved = editor.state.doc.resolve(position)
  let dir: 'ltr' | 'rtl' | undefined
  for (let depth = resolved.depth; depth >= 0 && !dir; depth--) {
    const declared = resolved.node(depth).attrs.dir
    if (declared === 'ltr' || declared === 'rtl') dir = declared
  }
  let lang: string | undefined
  for (let element: Element | null = editor.view.dom; element && (!dir || !lang); ) {
    const declared = element.getAttribute('dir')
    if (!dir && (declared === 'ltr' || declared === 'rtl')) dir = declared
    if (!lang) lang = element.getAttribute('lang') || undefined
    const root = element.getRootNode()
    element = element.parentElement ?? (root && 'host' in root ? (root as ShadowRoot).host : null)
  }
  return { dir, lang }
}

function defaultAtom(name: string, label: (name: string) => string, context: { dir: 'ltr' | 'rtl' | undefined; lang: string | undefined }): HTMLElement {
  const dom = document.createElement('span')
  const isolate = resolveDirection(context.dir, context.lang, name) === 'rtl' ? '\u2067' : '\u2066'
  dom.part.add('atom')
  dom.setAttribute(HTML_ATOM_ATTRIBUTE, name)
  dom.setAttribute('role', 'img')
  dom.setAttribute('aria-label', label(`${isolate}${name}\u2069`))
  dom.dir = 'auto'
  dom.contentEditable = 'false'
  dom.textContent = name
  return dom
}

function drawnAtom(name: string, draw: HtmlAtomOptions['draw']): HTMLElement | undefined {
  const drawn = draw(name)
  if (drawn === undefined) return undefined
  if (drawn instanceof HTMLElement) {
    drawn.contentEditable = 'false'
    return drawn
  }
  const dom = document.createElement('span')
  dom.contentEditable = 'false'
  if (typeof drawn === 'string') dom.textContent = drawn
  else dom.append(drawn)
  return dom
}

export function htmlAtom(options: HtmlAtomOptions) {
  return TiptapNode.create({
    name: HTML_ATOM_NAME,
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
      return { name: { default: '' } }
    },
    parseHTML() {
      return [
        {
          tag: `span[${HTML_ATOM_ATTRIBUTE}]`,
          getAttrs: (element) => {
            const name = (element as HTMLElement).getAttribute(HTML_ATOM_ATTRIBUTE)
            return name !== null && DOUBLE_BRACE_ATOM_NAME.test(name) ? { name } : false
          },
        },
      ]
    },
    renderHTML({ node }) {
      const name = String(node.attrs.name ?? '')
      return ['span', { [HTML_ATOM_ATTRIBUTE]: name }, `{{${name}}}`]
    },
    addNodeView() {
      return ({ editor, getPos, node }) => {
        const name = String(node.attrs.name ?? '')
        let dom: HTMLElement | undefined
        try {
          dom = drawnAtom(name, options.draw)
        } catch (reason) {
          options.error(name, reason)
        }
        const position = getPos()
        const context = directionContext(editor, typeof position === 'number' ? position : 0)
        return { dom: dom ?? defaultAtom(name, options.label, context) }
      }
    },
  })
}

export function atomizeHtmlEditor(editor: Editor): boolean {
  const atom = editor.schema.nodes[HTML_ATOM_NAME]
  if (!atom) return false
  const replacements: { from: number; to: number; name: string; marks: typeof editor.state.doc.marks }[] = []
  editor.state.doc.descendants((node, position) => {
    if (!node.isText || !node.text) return
    for (const match of node.text.matchAll(DOUBLE_BRACE_ATOM_TOKEN)) {
      const name = match[1]
      if (match.index === undefined || !name) continue
      replacements.push({ from: position + match.index, to: position + match.index + match[0].length, name, marks: node.marks })
    }
  })
  if (replacements.length === 0) return false
  const transaction = editor.state.tr
  for (const replacement of replacements.reverse()) {
    transaction.replaceWith(replacement.from, replacement.to, atom.create({ name: replacement.name }, null, replacement.marks))
  }
  editor.view.dispatch(transaction)
  return true
}
