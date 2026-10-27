import { APP_FONT_NAME, type FontReference } from '@segnavia/format'
import type { Element } from 'domhandler'
import { hasControlChar } from './control-char.ts'
import { elements, parse } from './sanitize.ts'

const FONT_PROPERTY = /(?:^|[;{])\s*(font-family|font)\s*:([^;{}]+)/gi
const FONT_PREFIX_KEYWORD =
  /^(?:italic|oblique|normal|small-caps|bold|bolder|lighter|(?:ultra-|extra-|semi-)?(?:condensed|expanded)|[1-9]00)\s+/i
const FONT_SIZE =
  /^(?:xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger|\d+(?:\.\d+)?(?:px|em|rem|pt|pc|in|cm|mm|ex|ch|vw|vh|%))(?:\s*\/\s*(?:normal|\d+(?:\.\d+)?(?:px|em|rem|pt|pc|in|cm|mm|ex|ch|vw|vh|%)?))?\s*/i
const FONT_VAR = /var\(\s*--segnavia-font-([A-Za-z0-9-]+)\s*\)/g

function refusal(place: string, problem: string, remedy: string): string {
  return `${place} could not establish ${problem}; ${remedy} to clear this refusal.`
}

function referencePlace(ref: FontReference): string {
  if ('app' in ref) return `font reference {app:${JSON.stringify(ref.app)}}`
  return `font reference {local:${JSON.stringify(ref.local)}, fallback:${JSON.stringify(ref.fallback)}}`
}

function appName(ref: FontReference): string | undefined {
  return 'app' in ref ? ref.app : undefined
}

function localRef(ref: FontReference): { local: string; fallback: string } | undefined {
  return 'local' in ref ? { local: ref.local, fallback: ref.fallback } : undefined
}

function styleText(element: Element): string {
  return element.children.map((child) => ('data' in child ? child.data : '')).join('')
}

function cssChunks(html: string): string[] {
  const chunks: string[] = []
  for (const element of elements(parse(html).children)) {
    const style = element.attribs.style
    if (style) chunks.push(style)
    if (element.name.toLowerCase() === 'style') chunks.push(styleText(element))
  }
  return chunks
}

function skipSpace(value: string, index: number): number {
  let i = index
  while (i < value.length && /\s/.test(value[i] ?? '')) i += 1
  return i
}

function readQuoted(value: string, index: number): { text: string; next: number } {
  const quote = value[index] ?? ''
  let i = index + 1
  let text = ''
  while (i < value.length) {
    const ch = value[i] ?? ''
    if (ch === '\\' && i + 1 < value.length) {
      text += value[i + 1] ?? ''
      i += 2
      continue
    }
    if (ch === quote) return { text, next: i + 1 }
    text += ch
    i += 1
  }
  return { text, next: i }
}

function readVar(value: string, index: number): { text: string; next: number } {
  let depth = 0
  let i = index
  while (i < value.length) {
    const ch = value[i] ?? ''
    if (ch === '(') depth += 1
    if (ch === ')') {
      depth -= 1
      if (depth === 0) return { text: value.slice(index, i + 1).replace(/\s+/g, ''), next: i + 1 }
    }
    i += 1
  }
  return { text: value.slice(index).replace(/\s+/g, ''), next: value.length }
}

function readIdent(value: string, index: number): { text: string; next: number } {
  let i = index
  while (i < value.length && value[i] !== ',') i += 1
  return { text: value.slice(index, i).trim(), next: i }
}

function stripFontShorthand(value: string): string {
  let rest = value.trim()
  while (FONT_PREFIX_KEYWORD.test(rest)) rest = rest.replace(FONT_PREFIX_KEYWORD, '')
  if (!FONT_SIZE.test(rest)) return value.trim()
  return rest.replace(FONT_SIZE, '')
}

function familyItems(value: string): string[] {
  const items: string[] = []
  let i = 0
  while (i < value.length) {
    i = skipSpace(value, i)
    if (i >= value.length) break
    const next = value.startsWith('var(', i) ? readVar(value, i) : value[i] === '"' || value[i] === "'" ? readQuoted(value, i) : readIdent(value, i)
    if (next.text) items.push(next.text)
    i = next.next
    i = skipSpace(value, i)
    if (value[i] === ',') i += 1
  }
  return items
}

function familyLists(css: string): string[][] {
  const lists: string[][] = []
  FONT_PROPERTY.lastIndex = 0
  for (const match of css.matchAll(FONT_PROPERTY)) {
    const property = (match[1] ?? '').toLowerCase()
    const value = match[2] ?? ''
    const items = familyItems(property === 'font' ? stripFontShorthand(value) : value)
    if (items.length > 0) lists.push(items)
  }
  return lists
}

function appNames(references: FontReference[]): Set<string> {
  const names = new Set<string>()
  for (const ref of references) {
    const name = appName(ref)
    if (name) names.add(name)
  }
  return names
}

function referenceRefusals(references: FontReference[], known: ReadonlySet<string>): string[] {
  const refusals: string[] = []
  for (const ref of references) {
    const app = appName(ref)
    const local = localRef(ref)
    const name = app ?? local?.fallback ?? ''
    if (!APP_FONT_NAME.test(name)) {
      refusals.push(refusal(referencePlace(ref), `an app font name matching ${APP_FONT_NAME}`, 'use a lowercase name of letters, digits and hyphens'))
      continue
    }
    if (!known.has(name)) {
      refusals.push(refusal(referencePlace(ref), `app font ${JSON.stringify(name)}`, 'make that font available from the source'))
    }
    if (local && hasControlChar(local.local)) {
      refusals.push(refusal(referencePlace(ref), 'a local family without control characters', 'remove control characters from the family name'))
    }
  }
  return refusals
}

function fallbackVar(fallback: string): string {
  return `var(--segnavia-font-${fallback})`
}

function localCssRefusals(lists: string[][], references: FontReference[]): string[] {
  const refusals: string[] = []
  for (const ref of references) {
    const local = localRef(ref)
    if (!local) continue
    const expected = fallbackVar(local.fallback)
    for (const items of lists) {
      const index = items.indexOf(local.local)
      if (index < 0) continue
      const next = items[index + 1]
      if (next === expected) continue
      const place = `page CSS font-family ${JSON.stringify(items.join(', '))}`
      if (!next?.startsWith('var(--segnavia-font-')) {
        refusals.push(
          refusal(place, `the declared fallback after ${JSON.stringify(local.local)}`, `write font-family: ${JSON.stringify(local.local)}, ${expected}`),
        )
      } else {
        refusals.push(refusal(place, `fallback ${next} matching declared ${expected}`, `write font-family: ${JSON.stringify(local.local)}, ${expected}`))
      }
    }
  }
  return refusals
}

function undeclaredVarRefusals(chunks: string[], declared: ReadonlySet<string>): string[] {
  const refusals: string[] = []
  const seen = new Set<string>()
  for (const css of chunks) {
    FONT_VAR.lastIndex = 0
    for (const match of css.matchAll(FONT_VAR)) {
      const name = match[1] ?? ''
      if (declared.has(name) || seen.has(name)) continue
      seen.add(name)
      refusals.push(
        refusal(
          `page CSS ${match[0]}`,
          `a fonts reference {app:${JSON.stringify(name)}}`,
          `add {app:${JSON.stringify(name)}} to the page or placed motif fonts`,
        ),
      )
    }
  }
  return refusals
}

export function fontReferenceRefusals(html: string, references: FontReference[], known: ReadonlySet<string>): string[] {
  const chunks = cssChunks(html)
  const lists = chunks.flatMap(familyLists)
  return [...referenceRefusals(references, known), ...localCssRefusals(lists, references), ...undeclaredVarRefusals(chunks, appNames(references))]
}
