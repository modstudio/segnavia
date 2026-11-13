import { documentOutline, entryDirection, type OutlineSource, type TextDirection } from '@segnavia/format'
import { embedFunction } from '@segnavia/html'

export const OUTLINE_HEADING_BASE_CSS =
  ':where([data-segnavia-outline-heading]){position:absolute;inline-size:1px;block-size:1px;overflow:hidden;white-space:nowrap}'

export interface ComposerTagEntry {
  id: string
  block: string
  depth: number
  title: string
  direction: TextDirection
}

export function composerTagEntries(source: OutlineSource): ComposerTagEntry[]
export function composerTagEntries(source: undefined): undefined
export function composerTagEntries(source: OutlineSource | undefined): ComposerTagEntry[] | undefined
export function composerTagEntries(source: OutlineSource | undefined): ComposerTagEntry[] | undefined {
  if (!source) return undefined
  const blocks = new Map(source.headings.map((heading) => [heading.id, heading.block]))
  return documentOutline(source).map((entry) => ({
    id: entry.id,
    block: blocks.get(entry.id) ?? entry.id,
    depth: entry.depth,
    title: entry.title,
    direction: entryDirection({ dir: source.direction }, entry.title),
  }))
}

export function tagComposerHeadings(root: Pick<Document, 'querySelectorAll'>, entries: readonly ComposerTagEntry[]): void {
  const depths = new Map(entries.map((entry) => [entry.id, entry.depth]))
  const headings = root.querySelectorAll('h1,h2,h3,h4,h5,h6')
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]
    if (!heading) continue
    const depth = depths.get(heading.getAttribute('id') ?? '')
    if (depth === undefined) heading.setAttribute('role', 'none')
    else heading.setAttribute('aria-level', String(depth))
  }
}

export function addMissingComposerHeadings(
  clone: Element,
  source: Pick<Document, 'getElementById' | 'createElement'>,
  rootId: string,
  opening: boolean,
  entries: readonly ComposerTagEntry[],
): void {
  const missing = entries.filter((entry) => !source.getElementById(entry.id)?.matches('h1,h2,h3,h4,h5,h6'))
  for (let index = missing.length - 1; index >= 0; index -= 1) {
    const entry = missing[index]
    if (!entry) continue
    const target = entry.block === rootId ? (opening ? clone : null) : clone.querySelector(`[id="${CSS.escape(entry.block)}"]`)
    if (!target) continue
    const heading = source.createElement('span')
    heading.setAttribute('data-segnavia-outline-heading', '')
    heading.setAttribute('role', 'heading')
    heading.setAttribute('aria-level', String(entry.depth))
    heading.setAttribute('dir', entry.direction)
    heading.textContent = entry.title
    if (target === clone) clone.prepend(heading)
    else target.parentNode?.insertBefore(heading, target)
  }
}

export interface CloneLineBox {
  top: number
}

export function stripCloneIds(
  clone: Element,
  original: Element,
  start: number,
  end: number,
  origin: number,
  linesFor: (element: Element, origin: number) => readonly CloneLineBox[],
): void {
  const consider = (node: Element, source: Element): void => {
    if (!node.getAttribute('id')) return
    const sourceLines = linesFor(source, origin)
    const top = sourceLines.length ? (sourceLines[0]?.top ?? 0) : source.getBoundingClientRect().top - origin
    if (top >= start && top < end) return
    node.removeAttribute('id')
    node.setAttribute('aria-hidden', 'true')
  }
  consider(clone, original)
  const ids = clone.querySelectorAll('[id]')
  const sources = original.querySelectorAll('[id]')
  for (let index = 0; index < ids.length; index += 1) {
    const source = sources[index]
    const held = ids[index]
    if (!held) continue
    if (!source) {
      held.removeAttribute('id')
      held.setAttribute('aria-hidden', 'true')
      continue
    }
    consider(held, source)
  }
}

export function embeddedComposerTagFunctions(): string {
  return [tagComposerHeadings, addMissingComposerHeadings, stripCloneIds].map((fn) => embedFunction(fn.name, fn)).join('\n')
}
