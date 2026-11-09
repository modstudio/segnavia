import { KEEP_WITH_CUSTOM_PROPERTY } from '@segnavia/format'
import { embedFunction, KEEP_WITH_VALUES } from '@segnavia/html'
import { inlineLevelDisplay, outermostKeepValue } from './composer-measure.ts'
import { keepGap } from './keep-gap.ts'

type StyleReader = (element: Element) => CSSStyleDeclaration
type Direction = 'next' | 'previous'
type GapPiece = { node: Text; start: number; end: number }
type GapRun = { pieces: GapPiece[]; inlineBoundary?: Element }
type TextGap = { piece?: GapPiece; stop: boolean }

export function outermostKeeps(elements: Element[], styleOf: StyleReader, acceptedValues: readonly string[], property: string): Element[] {
  return elements.filter((element) => {
    const value = styleOf(element).getPropertyValue(property).trim()
    const parentValue = element.parentElement ? styleOf(element.parentElement).getPropertyValue(property).trim() : ''
    return outermostKeepValue(value, parentValue, acceptedValues)
  })
}

function inlineLevel(element: Element, styleOf: StyleReader): boolean {
  return inlineLevelDisplay(styleOf(element).display)
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

function atomicInline(element: Element, styleOf: StyleReader): boolean {
  const display = styleOf(element).display.split(' ')[0] ?? ''
  const atomicTags = ':AUDIO:BR:CANVAS:EMBED:IFRAME:IMG:INPUT:MATH:OBJECT:SELECT:SVG:TEXTAREA:VIDEO:WBR:'
  return display.startsWith('inline') && (display !== 'inline' || atomicTags.includes(`:${element.tagName}:`))
}

function followingNode(node: Node, direction: Direction, block: Element, styleOf: StyleReader): Node | null {
  if (node.nodeType === 1) {
    const element = node as Element
    if (atomicInline(element, styleOf)) return null
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

function gapWalkStop(node: Node, direction: Direction, styleOf: StyleReader): { stopped: boolean; inlineBoundary?: Element } {
  if (node.nodeType !== 1) return { stopped: false }
  const element = node as Element
  if (!inlineLevel(element, styleOf)) return { stopped: true }
  if (atomicInline(element, styleOf) || !(direction === 'next' ? element.firstChild : element.lastChild)) {
    return { stopped: true, inlineBoundary: element }
  }
  return { stopped: false }
}

function orderedPieces(pieces: GapPiece[], direction: Direction): GapPiece[] {
  return direction === 'next' ? pieces : pieces.reverse()
}

function gapPieces(element: Element, direction: Direction, block: Element, styleOf: StyleReader): GapRun {
  const pieces: GapPiece[] = []
  let node = adjacentNode(element, direction, block)
  while (node && block.contains(node.nodeType === 1 ? node : node.parentNode)) {
    const stopped = gapWalkStop(node, direction, styleOf)
    if (stopped.stopped) return { pieces: orderedPieces(pieces, direction), inlineBoundary: stopped.inlineBoundary }
    const gap = textGap(node, direction)
    if (gap.piece) pieces.push(gap.piece)
    if (gap.stop) break
    node = followingNode(node, direction, block, styleOf)
  }
  return { pieces: orderedPieces(pieces, direction) }
}

function replaceGap(pieces: GapPiece[], replacement: string, replacementIndex: number): void {
  pieces.forEach((piece, index) => {
    const value = piece.node.nodeValue ?? ''
    piece.node.nodeValue = value.slice(0, piece.start) + (index === replacementIndex ? replacement : '') + value.slice(piece.end)
  })
}

function insertJoiner(document: Document, element: Element, direction: Direction, value = '\u2060'): void {
  const joiner = document.createTextNode(value)
  if (direction === 'next') element.parentNode?.insertBefore(joiner, element.nextSibling)
  else element.parentNode?.insertBefore(joiner, element)
}

function rewriteGap(document: Document, element: Element, direction: Direction, styleOf: StyleReader, gapReplacement: typeof keepGap): void {
  const block = containingBlock(element, styleOf)
  if (!block) return
  const gap = gapPieces(element, direction, block, styleOf)
  const pieces = gap.pieces
  const whiteSpace = styleOf(block).whiteSpace
  if (pieces.length > 0) {
    const text = pieces.map((piece) => piece.node.nodeValue?.slice(piece.start, piece.end) ?? '').join('')
    replaceGap(pieces, gapReplacement(text, whiteSpace), direction === 'next' ? 0 : pieces.length - 1)
    insertJoiner(document, element, direction)
    if (gap.inlineBoundary) insertJoiner(document, gap.inlineBoundary, direction === 'next' ? 'previous' : 'next')
    return
  }
  insertJoiner(document, element, direction, gapReplacement('', whiteSpace))
}

export function applyKeepWith(
  document: Document,
  styleOf: StyleReader,
  gapReplacement: typeof keepGap,
  acceptedValues: readonly string[],
  property: string,
): void {
  const inlineStyles = Array.from(document.querySelectorAll<HTMLElement>('[style]'))
  const selectors: string[] = []
  let found = inlineStyles.some((element) => element.getAttribute('style')?.includes(property))
  const scan = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (!rule.cssText.includes(property)) continue
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

  const candidates = new Set<Element>(inlineStyles.filter((element) => element.getAttribute('style')?.includes(property)))
  for (const selector of selectors) {
    try {
      for (const element of Array.from(document.querySelectorAll(selector))) candidates.add(element)
    } catch {
      // Ignore a selector the current engine cannot parse.
    }
  }

  const keeps = outermostKeeps(Array.from(candidates), styleOf, acceptedValues, property)
  for (const element of keeps) {
    const direction = styleOf(element).getPropertyValue(property).trim() as Direction
    if (inlineLevel(element, styleOf)) rewriteGap(document, element, direction, styleOf, gapReplacement)
    else if (direction === 'next') (element as HTMLElement).style.breakAfter = 'avoid'
    else (element as HTMLElement).style.breakBefore = 'avoid'
  }
}

export function keepPassScript(): string {
  const functions: Array<[string, { name: string; toString(): string }]> = [
    ['keepGap', keepGap],
    ['outermostKeepValue', outermostKeepValue],
    ['inlineLevelDisplay', inlineLevelDisplay],
    ['outermostKeeps', outermostKeeps],
    ['inlineLevel', inlineLevel],
    ['containingBlock', containingBlock],
    ['adjacentNode', adjacentNode],
    ['atomicInline', atomicInline],
    ['followingNode', followingNode],
    ['textGap', textGap],
    ['gapWalkStop', gapWalkStop],
    ['orderedPieces', orderedPieces],
    ['gapPieces', gapPieces],
    ['replaceGap', replaceGap],
    ['insertJoiner', insertJoiner],
    ['rewriteGap', rewriteGap],
    ['applyKeepWith', applyKeepWith],
  ]
  const source = functions.map(([name, fn]) => embedFunction(name, fn)).join('\n')
  return `var KEEP_WITH_VALUES=${JSON.stringify(KEEP_WITH_VALUES)};var KEEP_WITH_CUSTOM_PROPERTY=${JSON.stringify(KEEP_WITH_CUSTOM_PROPERTY)};\n${source}\ndocument.addEventListener('DOMContentLoaded',function(){applyKeepWith(document,function(element){return getComputedStyle(element);},keepGap,KEEP_WITH_VALUES,KEEP_WITH_CUSTOM_PROPERTY);});`
}
