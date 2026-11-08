import type { BuiltSection } from './book-held.ts'
import { element, text } from './dom.ts'

export const SECTION_TITLE_MARK = 'segnavia:section-title'

function boundary(section: BuiltSection, continued: boolean): ReturnType<typeof element> {
  const title = section.info.runningHead ?? ''
  return element(
    'div',
    {
      class: 'segnavia-section-boundary',
      'data-mark': SECTION_TITLE_MARK,
      'data-segnavia-chapter': section.node.attribs['data-segnavia-chapter'] ?? '0',
      ...(continued ? { id: section.info.id } : {}),
    },
    [text(title)],
  )
}

function flowing(section: BuiltSection): boolean {
  const kind = section.node.attribs['data-segnavia-kind']
  return kind !== 'fixed' && kind !== 'templated'
}

export function continuingFlowRoots(sections: BuiltSection[]): BuiltSection[] {
  const roots: BuiltSection[] = []
  for (const section of sections) {
    if (!flowing(section)) {
      roots.push(section)
      continue
    }
    const continued = section.node.attribs['data-opens'] === 'continue'
    section.node.children.unshift(boundary(section, continued))
    if (!continued) {
      roots.push(section)
      continue
    }
    const preceding = roots.at(-1)
    if (!preceding) throw new Error(`continuing section ${section.info.id} has no preceding flow`)
    preceding.node.children.push(...section.node.children)
  }
  return roots
}
