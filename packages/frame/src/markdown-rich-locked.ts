import { isDiagramFence, isGithubAlertBlock } from '@segnavia/html'
import { Node } from '@tiptap/core'

export const LOCKED_BLOCK_NAME = 'lockedBlock'

export type MarkedToken = { type: string; raw: string; lang?: string; depth?: number }

export function lockedFenceLabel(lockedFences: Record<string, string>, language: string | undefined): string | undefined {
  return lockedFences[language?.toLowerCase() ?? '']
}

function matchFrontmatter(src: string): string | undefined {
  return /^---[ \t]*\n[\s\S]*?\n---[ \t]*(?:\n|$)/.exec(src)?.[0]
}

function matchDirectiveContainer(src: string): string | undefined {
  const firstNl = src.indexOf('\n')
  if (firstNl < 0) return undefined
  const open = /^(:{3,})[^\n]*$/.exec(src.slice(0, firstNl))
  if (!open) return undefined
  const fenceLen = open[1]?.length ?? 0
  let pos = firstNl + 1
  while (pos <= src.length) {
    const nextNl = src.indexOf('\n', pos)
    const lineEnd = nextNl < 0 ? src.length : nextNl
    const colons = /^(:{3,})[ \t]*$/.exec(src.slice(pos, lineEnd))
    if ((colons?.[1]?.length ?? 0) >= fenceLen) return src.slice(0, nextNl < 0 ? src.length : nextNl + 1)
    if (nextNl < 0) return undefined
    pos = nextNl + 1
  }
  return undefined
}

function isHtmlComment(raw: string): boolean {
  return /^<!--[\s\S]*-->$/.test(raw.replace(/\n+$/, ''))
}

export function isLockedToken(token: MarkedToken, lockedFences: Record<string, string> = {}): boolean {
  if (token.type === 'frontmatter' || token.type === 'directive') return true
  if (token.type === 'code' && (isDiagramFence(token.lang) || Boolean(lockedFenceLabel(lockedFences, token.lang)))) return true
  if (token.type === 'blockquote' && isGithubAlertBlock(token.raw)) return true
  return token.type === 'html' && !isHtmlComment(token.raw)
}

export function isSilentToken(token: MarkedToken): boolean {
  return token.type === 'def' || (token.type === 'html' && isHtmlComment(token.raw))
}

export function lockedNode(source: string, label?: string) {
  return { type: LOCKED_BLOCK_NAME, attrs: { source, label: label ?? null, dir: 'auto' } }
}

export const LockedBlock = Node.create({
  name: LOCKED_BLOCK_NAME,
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() {
    return { source: { default: '' }, label: { default: null }, dir: { default: 'auto' } }
  },
  parseHTML() {
    return [{ tag: 'div[data-locked-block]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', { ...HTMLAttributes, 'data-locked-block': '', dir: 'auto' }]
  },
  renderMarkdown(node) {
    return typeof node.attrs?.source === 'string' ? node.attrs.source : ''
  },
  markdownTokenizer: {
    name: 'lockedFence',
    level: 'block',
    start(src: string) {
      return src.startsWith('---') || src.startsWith(':::') ? 0 : -1
    },
    tokenize(src: string, tokens: unknown[]) {
      if (tokens.length === 0) {
        const frontmatter = matchFrontmatter(src)
        if (frontmatter) return { type: 'frontmatter', raw: frontmatter }
      }
      const directive = matchDirectiveContainer(src)
      return directive ? { type: 'directive', raw: directive } : undefined
    },
  },
})
