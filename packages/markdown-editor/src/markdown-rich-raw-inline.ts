import { Node } from '@tiptap/core'

export const RAW_INLINE_NAME = 'rawInline'
export const RAW_INLINE_ATTRIBUTE = 'data-raw-inline'
export const RAW_INLINE_SOURCE_ATTRIBUTE = 'data-raw-source'
export const RAW_INLINE_DISPLAY_ATTRIBUTE = 'data-raw-display'

const ASCII_PUNCTUATION = String.raw`[!-/:-@\[-` + '{-~]'
const escapePattern = new RegExp(`^\\\\${ASCII_PUNCTUATION}`)
const entityPattern = /^&(?:[A-Za-z][A-Za-z0-9]+|#[0-9]+|#[xX][0-9A-Fa-f]+);/
const footnotePattern = /^\[\^[^\]\n]+\]/
const inlineHtmlPattern = /^(?:<!--[\s\S]*?-->|<\/?[A-Za-z](?:[^<>"']|"[^"]*"|'[^']*')*?>)/
const bracketContent = String.raw`(?:\\.|[^\[\]\\]|\[(?:\\.|[^\[\]\\])*\])*`
const referencePattern = new RegExp(`^(!?)\\[(${bracketContent})\\](?:\\[(${bracketContent})\\])?`)

export function normalizeReferenceLabel(label: string): string {
  return label.trim().replace(/\s+/g, ' ').toLowerCase()
}

function referenceSource(src: string, labels: ReadonlySet<string>): string | undefined {
  const match = referencePattern.exec(src)
  if (!match) return undefined
  const raw = match[0]
  const firstLabel = match[2] ?? ''
  const secondLabel = match[3]
  if (secondLabel === undefined && src[raw.length] === '(') return undefined
  const label = secondLabel === undefined || secondLabel === '' ? firstLabel : secondLabel
  return labels.has(normalizeReferenceLabel(label)) ? raw : undefined
}

function rawSource(src: string, labels: ReadonlySet<string>): { source: string; display: string } | undefined {
  const escaped = escapePattern.exec(src)?.[0]
  if (escaped) return { source: escaped, display: escaped.slice(1) }
  const entity = entityPattern.exec(src)?.[0]
  if (entity) return { source: entity, display: entity }
  const footnote = footnotePattern.exec(src)?.[0]
  if (footnote) return { source: footnote, display: footnote }
  const reference = referenceSource(src, labels)
  if (reference) return { source: reference, display: reference }
  const html = inlineHtmlPattern.exec(src)?.[0]
  return html && (!html.startsWith('<!') ? !/\n[ \t]*\n/.test(html) : true) ? { source: html, display: html } : undefined
}

export function rawInline(labels: ReadonlySet<string> = new Set()) {
  return Node.create({
    name: RAW_INLINE_NAME,
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
      return {
        source: {
          default: '',
          parseHTML: (element) => element.getAttribute(RAW_INLINE_SOURCE_ATTRIBUTE) ?? '',
          renderHTML: (attrs) => ({ [RAW_INLINE_SOURCE_ATTRIBUTE]: attrs.source }),
        },
        display: {
          default: '',
          parseHTML: (element) => element.getAttribute(RAW_INLINE_DISPLAY_ATTRIBUTE) ?? '',
          renderHTML: (attrs) => ({ [RAW_INLINE_DISPLAY_ATTRIBUTE]: attrs.display }),
        },
      }
    },
    parseHTML() {
      return [{ tag: `span[${RAW_INLINE_ATTRIBUTE}]` }]
    },
    renderHTML({ HTMLAttributes }) {
      return ['span', { ...HTMLAttributes, [RAW_INLINE_ATTRIBUTE]: '', dir: 'auto' }]
    },
    parseMarkdown(token) {
      return { type: RAW_INLINE_NAME, attrs: { source: token.source, display: token.display } }
    },
    renderMarkdown(node) {
      return typeof node.attrs?.source === 'string' ? node.attrs.source : ''
    },
    markdownTokenizer: {
      name: RAW_INLINE_NAME,
      level: 'inline',
      start(src: string) {
        const candidates = labels.size ? /\\|&|!?\[|</g : /\\|&|\[\^|</g
        for (const match of src.matchAll(candidates)) {
          if (match.index === undefined) continue
          if (rawSource(src.slice(match.index), labels)) return match.index
        }
        return -1
      },
      tokenize(src: string) {
        const raw = rawSource(src, labels)
        return raw ? { type: RAW_INLINE_NAME, raw: raw.source, source: raw.source, display: raw.display } : undefined
      },
    },
  })
}

export const RawInline = rawInline()
