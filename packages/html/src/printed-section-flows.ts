import type { ParentRules, PrintedPages } from '@segnavia/format'
import { continuingFlowRoots } from './book/book-continue.ts'
import { type BuiltSection, flowAttribs, numberingAttribs, recordAttribs } from './book/book-held.ts'
import { element } from './book/dom.ts'
import { bindRecordValues } from './record-values.ts'
import { parse, serialize } from './sanitize.ts'

type PrintedSection = NonNullable<PrintedPages['sections']>[number]

export function printedSectionFlows(sections: readonly PrintedSection[], rules: ParentRules): string {
  const built: BuiltSection[] = sections.map((section) => {
    section = bindRecordValues(section)
    const attribs = flowAttribs(section.opens, section.parentRules ?? rules, {
      ...numberingAttribs(section.numbering),
      'data-sequence': 'body',
      ...recordAttribs(section.record),
    })
    return {
      info: { id: section.id, kind: 'chapter', division: 'body', title: section.title, runningHead: section.title, opens: section.opens },
      node: element('div', { 'data-segnavia-flow': section.id, id: section.id, ...attribs }, parse(section.html).children),
    }
  })
  return continuingFlowRoots(built)
    .map((section) => serialize(section.node))
    .join('')
}
