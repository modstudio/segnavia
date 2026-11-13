import type { ParentRules, PrintedPages } from '@segnavia/format'
import { type ChildNode, isTag } from 'domhandler'
import { continuingFlowRoots } from './book/book-continue.ts'
import { targetLinksForIds } from './book/book-document-nodes.ts'
import { type BuiltSection, flowAttribs, numberingAttribs, recordAttribs } from './book/book-held.ts'
import { element } from './book/dom.ts'
import { bindRecordValues } from './record-values.ts'
import { parse, serialize } from './sanitize.ts'

type PrintedSection = NonNullable<PrintedPages['sections']>[number]

function headingDestinations(nodes: readonly ChildNode[], prefix?: string): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (!isTag(node)) continue
    if (/^h[1-6]$/.test(node.name) && node.attribs['data-segnavia-id']) {
      node.attribs.id = prefix ? `${prefix}-${node.attribs['data-segnavia-id']}` : (node.attribs.id ?? node.attribs['data-segnavia-id'])
      ids.push(node.attribs.id)
    }
    ids.push(...headingDestinations(node.children, prefix))
  }
  return ids
}

export function printedHeadingDestinations(html: string, prefix?: string): string {
  const document = parse(html)
  const ids = headingDestinations(document.children, prefix)
  if (ids.length > 0) document.children.push(targetLinksForIds(ids))
  return serialize(document.children)
}

export function printedSectionOutlineHtml(section: PrintedSection): string {
  if ('pages' in section) return section.pages.map((page) => printedHeadingDestinations(page.html)).join('')
  const bound = bindRecordValues(section)
  return printedHeadingDestinations(bound.html, bound.record ? bound.id : undefined)
}

export function printedSectionFlows(sections: readonly PrintedSection[], rules: ParentRules): string {
  const built: BuiltSection[] = sections.map((section) => {
    const fixed = 'pages' in section
    const document = parse(fixed ? '' : printedSectionOutlineHtml(section))
    const attribs = flowAttribs(
      section.opens,
      section.parentRules ?? rules,
      {
        ...numberingAttribs(section.numbering),
        'data-sequence': 'body',
        ...(!fixed && section.record ? recordAttribs(section.record) : {}),
        ...(fixed ? { 'data-segnavia-kind': 'fixed' } : {}),
      },
      section.pageGeometry,
    )
    const children =
      'pages' in section
        ? section.pages.map((page, index) =>
            element('div', { 'data-segnavia-designed-page': String(index + 1), hidden: '' }, parse(printedHeadingDestinations(page.html)).children),
          )
        : document.children
    return {
      info: { id: section.id, kind: 'chapter', division: 'body', title: section.title, opens: section.opens },
      node: element('div', { 'data-segnavia-flow': section.id, id: section.id, ...attribs }, children),
    }
  })
  return continuingFlowRoots(built)
    .map((section) => serialize(section.node))
    .join('')
}
