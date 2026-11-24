import { type Editor, Node as TiptapNode } from '@tiptap/core'

export const HTML_ATOM_NAME = 'atom'
export const HTML_ATOM_ATTRIBUTE = 'data-html-atom'

const DOUBLE_BRACE_TOKEN = /\{\{ *([\p{L}_][\p{L}\p{N}_.-]*) *\}\}/gu

export interface HtmlAtomOptions {
  draw: (name: string) => globalThis.Node | string | undefined
  label: (name: string) => string
}

function defaultAtom(name: string, label: (name: string) => string): HTMLElement {
  const dom = document.createElement('span')
  dom.part.add('atom')
  dom.setAttribute(HTML_ATOM_ATTRIBUTE, name)
  dom.setAttribute('role', 'img')
  dom.setAttribute('aria-label', label(`\u2068${name}\u2069`))
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
          getAttrs: (element) => ({ name: (element as HTMLElement).getAttribute(HTML_ATOM_ATTRIBUTE) ?? '' }),
        },
      ]
    },
    renderHTML({ node }) {
      const name = String(node.attrs.name ?? '')
      return ['span', { [HTML_ATOM_ATTRIBUTE]: name }, `{{${name}}}`]
    },
    addNodeView() {
      return ({ node }) => {
        const name = String(node.attrs.name ?? '')
        return { dom: drawnAtom(name, options.draw) ?? defaultAtom(name, options.label) }
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
    for (const match of node.text.matchAll(DOUBLE_BRACE_TOKEN)) {
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
