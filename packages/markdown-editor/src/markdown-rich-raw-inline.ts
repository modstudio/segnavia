import { Node } from '@tiptap/core'

export const RAW_INLINE_NAME = 'rawInline'

const ASCII_PUNCTUATION = String.raw`[!-/:-@\[-` + String.raw`{-~]`
const escapePattern = new RegExp(`^\\\\${ASCII_PUNCTUATION}`)
const entityPattern = /^&(?:[A-Za-z][A-Za-z0-9]+|#[0-9]+|#[xX][0-9A-Fa-f]+);/
const footnotePattern = /^\[\^[^\]\n]+\]/
const inlineHtmlPattern = /^(?:<!--[\s\S]*?-->|<\/?[A-Za-z](?:[^<>"'\n]|"[^"]*"|'[^']*')*?>)/
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
  const label = secondLabel === undefined || secondLabel === '' ? firstLabel : secondLabel
  return labels.has(normalizeReferenceLabel(label)) ? raw : undefined
}

function rawSource(src: string, labels: ReadonlySet<string>): { source: string; display: string } | undefined {
  const escape = escapePattern.exec(src)?.[0]
  if (escape) return { source: escape, display: escape.slice(1) }
  const entity = entityPattern.exec(src)?.[0]
  if (entity) return { source: entity, display: entity }
  const footnote = footnotePattern.exec(src)?.[0]
  if (footnote) return { source: footnote, display: footnote }
  const reference = referenceSource(src, labels)
  if (reference) return { source: reference, display: reference }
  const html = inlineHtmlPattern.exec(src)?.[0]
  return html ? { source: html, display: html } : undefined
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
          parseHTML: (element) => element.getAttribute('data-raw-source') ?? '',
          renderHTML: (attrs) => ({ 'data-raw-source': attrs.source }),
        },
        display: {
          default: '',
          parseHTML: (element) => element.getAttribute('data-raw-display') ?? '',
          renderHTML: (attrs) => ({ 'data-raw-display': attrs.display }),
        },
      }
    },
    parseHTML() {
      return [{ tag: 'span[data-raw-inline]' }]
    },
    renderHTML({ HTMLAttributes }) {
      return ['span', { ...HTMLAttributes, 'data-raw-inline': '', dir: 'auto' }]
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
        for (let index = 0; index < src.length; index++) if (rawSource(src.slice(index), labels)) return index
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
