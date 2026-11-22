import type { ResolvedNoteSeries } from '@segnavia/format'
import type { ChildNode, Element } from 'domhandler'
import { elements } from '../sanitize.ts'
import type { BuiltSection } from './book-held.ts'
import { element, text } from './dom.ts'
import type { BookVariableSetPoint } from './types.ts'

export function targetLinksForIds(ids: readonly string[]): ReturnType<typeof element> {
  return element(
    'div',
    { class: 'segnavia-targets', 'aria-hidden': 'true' },
    [...new Set(ids)].map((id) => element('a', { href: `#${id}`, tabindex: '-1' }, [text('\u200b')])),
  )
}

export function targetLinks(sections: BuiltSection[]): ReturnType<typeof element> {
  const ids = sections.flatMap((section) => [section.info.id, ...elements(section.node.children).flatMap((node) => (node.attribs.id ? [node.attribs.id] : []))])
  return targetLinksForIds(ids)
}

function nodeText(node: ChildNode): string {
  if (node.type === 'text') return node.data
  return 'children' in node ? node.children.map(nodeText).join('') : ''
}

export function variableSetPoints(sections: BuiltSection[], enabled: boolean): Map<BuiltSection, BookVariableSetPoint[]> {
  const output = new Map<BuiltSection, BookVariableSetPoint[]>()
  if (!enabled) return output
  const authoredIds = new Set(sections.flatMap((section) => elements([section.node]).flatMap((node) => (node.attribs.id ? [node.attribs.id] : []))))
  let generated = 0
  for (const section of sections) {
    if (section.info.kind === 'designed' || section.info.kind === 'templated') continue
    const points = elements(section.node.children).flatMap((node): BookVariableSetPoint[] => {
      const name = node.attribs['data-variable']
      if (!name) return []
      let id = node.attribs.id
      if (!id) {
        do {
          generated += 1
          id = `segnavia-variable-${generated}`
        } while (authoredIds.has(id))
        node.attribs.id = id
      }
      return [{ id, name, value: nodeText(node).replace(/\s+/g, ' ').trim(), section: section.info.id }]
    })
    output.set(section, points)
  }
  return output
}

function notesGalley(series: string, paragraphs: Element[]): ReturnType<typeof element> {
  const notes = paragraphs.map((paragraph) => element('div', { 'data-segnavia-note': paragraph.attribs.id ?? '' }, [paragraph]))
  return element('aside', { 'data-segnavia-notes-galley': '', 'data-segnavia-note-series': series, 'aria-hidden': 'true' }, notes)
}

export function notesGalleys(series: ResolvedNoteSeries[], paragraphs: Map<string, Element[]>): ReturnType<typeof element>[] {
  return series.flatMap((item) => {
    const held = paragraphs.get(item.name)
    return item.placement === 'page' && held?.length ? [notesGalley(item.name, held)] : []
  })
}

export function withBlankPages(sections: BuiltSection[], blankBefore: string[] | undefined): ChildNode[] {
  const counts = new Map<string, number>()
  for (const id of blankBefore ?? []) counts.set(id, (counts.get(id) ?? 0) + 1)
  return sections.flatMap((section): ChildNode[] => [
    ...Array.from({ length: counts.get(section.info.id) ?? 0 }, () => element('div', { class: 'segnavia-blank', 'aria-hidden': 'true' })),
    section.node,
  ])
}
