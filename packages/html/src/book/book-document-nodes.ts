import type { ResolvedNoteSeries } from '@segnavia/format'
import type { ChildNode, Element } from 'domhandler'
import { elements } from '../sanitize.ts'
import type { BuiltSection } from './book-held.ts'
import { element, text } from './dom.ts'

export function targetLinks(sections: BuiltSection[]): ReturnType<typeof element> {
  const ids = sections.flatMap((section) => [section.info.id, ...elements(section.node.children).flatMap((node) => (node.attribs.id ? [node.attribs.id] : []))])
  return element(
    'div',
    { class: 'segnavia-targets', 'aria-hidden': 'true' },
    [...new Set(ids)].map((id) => element('a', { href: `#${id}`, tabindex: '-1' }, [text('\u200b')])),
  )
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
