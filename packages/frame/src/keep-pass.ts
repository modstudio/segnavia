import { embedFunction, KEEP_WITH_VALUES } from '@segnavia/html'
import { keepGap } from './keep-gap.ts'

type StyleReader = (element: Element) => CSSStyleDeclaration
type Direction = 'next' | 'previous'
type GapPiece = { node: Text; start: number; end: number }
type TextGap = { piece?: GapPiece; stop: boolean }

export function outermostKeeps(elements: Element[], styleOf: StyleReader): Element[] {
  return elements.filter((element) => {
    const value = styleOf(element).getPropertyValue('--segnavia-keep-with').trim()
    if (!(KEEP_WITH_VALUES as readonly string[]).includes(value)) return false
    return !element.parentElement || styleOf(element.parentElement).getPropertyValue('--segnavia-keep-with').trim() !== value
  })
}

function inlineLevel(element: Element, styleOf: StyleReader): boolean {
  return styleOf(element).display.split(' ')[0]?.startsWith('inline') === true
}

function containingBlock(element: Element, styleOf: StyleReader): Element | null {
  let block = element.parentElement
  while (block && inlineLevel(block, styleOf)) block = block.parentElement
  return block
}

function adjacentNode(element: Element, direction: Direction, block: Element): Node | null {
  let node: Node | null = element
  while (node && node !== block) {
    const sibling = direction === 'next' ? node.nextSibling : node.previousSibling
    if (sibling) return sibling
    node = node.parentNode
  }
  return null
}

const ATOMIC_INLINE_TAGS = new Set(['AUDIO', 'BR', 'CANVAS', 'EMBED', 'IFRAME', 'IMG', 'INPUT', 'MATH', 'OBJECT', 'SELECT', 'SVG', 'TEXTAREA', 'VIDEO', 'WBR'])

function followingNode(node: Node, direction: Direction, block: Element, styleOf: StyleReader): Node | null {
  if (node.nodeType === 1) {
    const element = node as Element
    if (styleOf(element).display.split(' ')[0] !== 'inline' || ATOMIC_INLINE_TAGS.has(element.tagName)) return null
    const child = direction === 'next' ? node.firstChild : node.lastChild
    return child
  }
  let current: Node | null = node
  while (current && current !== block) {
    const sibling = direction === 'next' ? current.nextSibling : current.previousSibling
    if (sibling) return sibling
    current = current.parentNode
  }
  return null
}

function textGap(node: Node, direction: Direction): TextGap {
  if (node.nodeType !== 3) return { stop: false }
  const text = node.nodeValue ?? ''
  const match = direction === 'next' ? /^\s+/.exec(text) : /\s+$/.exec(text)
  if (!match) return { stop: text.length > 0 }
  const start = direction === 'next' ? 0 : text.length - match[0].length
  return { piece: { node: node as Text, start, end: start + match[0].length }, stop: match[0].length !== text.length }
}

function gapPieces(element: Element, direction: Direction, block: Element, styleOf: StyleReader): GapPiece[] {
  const pieces: GapPiece[] = []
  let node = adjacentNode(element, direction, block)
  while (node && block.contains(node.nodeType === 1 ? node : node.parentNode)) {
    if (node.nodeType === 1 && !inlineLevel(node as Element, styleOf)) break
    const gap = textGap(node, direction)
    if (gap.piece) pieces.push(gap.piece)
    if (gap.stop) break
    node = followingNode(node, direction, block, styleOf)
  }
  return direction === 'next' ? pieces : pieces.reverse()
}

function replaceGap(pieces: GapPiece[], replacement: string, replacementIndex: number): void {
  pieces.forEach((piece, index) => {
    const value = piece.node.nodeValue ?? ''
    piece.node.nodeValue = value.slice(0, piece.start) + (index === replacementIndex ? replacement : '') + value.slice(piece.end)
  })
}

function rewriteGap(document: Document, element: Element, direction: Direction, styleOf: StyleReader, gapReplacement: typeof keepGap): void {
  const block = containingBlock(element, styleOf)
  if (!block) return
  const pieces = gapPieces(element, direction, block, styleOf)
  const whiteSpace = styleOf(block).whiteSpace
  if (pieces.length > 0) {
    const text = pieces.map((piece) => piece.node.nodeValue?.slice(piece.start, piece.end) ?? '').join('')
    replaceGap(pieces, gapReplacement(text, whiteSpace), direction === 'next' ? 0 : pieces.length - 1)
    return
  }
  const joiner = document.createTextNode(gapReplacement('', whiteSpace))
  if (direction === 'next') element.parentNode?.insertBefore(joiner, element.nextSibling)
  else element.parentNode?.insertBefore(joiner, element)
}

export function applyKeepWith(document: Document, styleOf: StyleReader, gapReplacement: typeof keepGap): void {
  const inlineStyles = Array.from(document.querySelectorAll<HTMLElement>('[style]'))
  const selectors: string[] = []
  let found = inlineStyles.some((element) => element.getAttribute('style')?.includes('--segnavia-keep-with'))
  const scan = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (!rule.cssText.includes('--segnavia-keep-with')) continue
      found = true
      if ('selectorText' in rule && typeof rule.selectorText === 'string') selectors.push(rule.selectorText)
      if ('cssRules' in rule) scan(rule.cssRules as CSSRuleList)
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      scan(sheet.cssRules)
    } catch {
      // An unreadable sheet cannot contribute candidates, but must not stop other keeps.
    }
  }
  if (!found) return

  const candidates = new Set<Element>(inlineStyles.filter((element) => element.getAttribute('style')?.includes('--segnavia-keep-with')))
  for (const selector of selectors) {
    try {
      for (const element of Array.from(document.querySelectorAll(selector))) candidates.add(element)
    } catch {
      // Ignore a selector the current engine cannot parse.
    }
  }

  const keeps = outermostKeeps(Array.from(candidates), styleOf)
  for (const element of keeps) {
    const direction = styleOf(element).getPropertyValue('--segnavia-keep-with').trim() as Direction
    if (inlineLevel(element, styleOf)) rewriteGap(document, element, direction, styleOf, gapReplacement)
    else if (direction === 'next') (element as HTMLElement).style.breakAfter = 'avoid'
    else (element as HTMLElement).style.breakBefore = 'avoid'
  }
}

export function keepPassScript(): string {
  const functions: Array<[string, { name: string; toString(): string }]> = [
    ['keepGap', keepGap],
    ['outermostKeeps', outermostKeeps],
    ['inlineLevel', inlineLevel],
    ['containingBlock', containingBlock],
    ['adjacentNode', adjacentNode],
    ['followingNode', followingNode],
    ['textGap', textGap],
    ['gapPieces', gapPieces],
    ['replaceGap', replaceGap],
    ['rewriteGap', rewriteGap],
    ['applyKeepWith', applyKeepWith],
  ]
  const source = functions.map(([name, fn]) => embedFunction(name, fn)).join('\n')
  return `var KEEP_WITH_VALUES=${JSON.stringify(KEEP_WITH_VALUES)};var ATOMIC_INLINE_TAGS=new Set(${JSON.stringify(Array.from(ATOMIC_INLINE_TAGS))});\n${source}\ndocument.addEventListener('DOMContentLoaded',function(){applyKeepWith(document,function(element){return getComputedStyle(element);},keepGap);});`
}
