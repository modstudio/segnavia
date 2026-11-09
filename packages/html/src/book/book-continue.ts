import { SECTION_BOUNDARY_CLASS, SECTION_TITLE_MARK } from '@segnavia/format'
import { cloneNode } from 'domhandler'
import type { BuiltSection } from './book-held.ts'
import { element, text } from './dom.ts'

function boundary(section: BuiltSection): ReturnType<typeof element> {
  const title = section.info.runningHead ?? ''
  return element(
    'div',
    {
      class: SECTION_BOUNDARY_CLASS,
      'data-mark': SECTION_TITLE_MARK,
      'data-mark-scope': 'flow',
      'data-segnavia-chapter': section.node.attribs['data-segnavia-chapter'] ?? '0',
      id: section.info.id,
    },
    [text(title)],
  )
}

export function continuingFlowRoots(sections: BuiltSection[]): BuiltSection[] {
  const roots: BuiltSection[] = []
  for (const section of sections) {
    const continued = section.node.attribs['data-opens'] === 'continue'
    if (!continued) {
      roots.push({ info: section.info, node: cloneNode(section.node, true) })
      continue
    }
    const preceding = roots.at(-1)
    if (!preceding) throw new Error(`continuing section ${section.info.id} has no preceding flow`)
    preceding.node.children.push(boundary(section), ...section.node.children.map((child) => cloneNode(child, true)))
  }
  return roots
}
