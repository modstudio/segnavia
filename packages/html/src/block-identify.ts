import { DOCUMENT_PROFILES, type Document } from '@segnavia/format'
import type { ChildNode, Element } from 'domhandler'
import { isTag } from 'domhandler'
import { BLOCK_KINDS } from './block-context.ts'
import { fillAttributeIssues } from './fill-attributes.ts'
import { FIT_ATTRIBUTE_FAMILY } from './fit-attributes.ts'
import { LINE_NUMBER_ATTRIBUTE_FAMILY } from './line-number-attributes.ts'
import { MEASURE_ATTRIBUTE_FAMILY } from './measure-attributes.ts'
import { parse, serialize } from './sanitize.ts'
import { SIDE_NOTE_ATTRIBUTE_FAMILY } from './side-note-attributes.ts'
import { parentRegionAttributeIssue, sourceAttributeIssues } from './source-attributes.ts'

export interface BlockIdLocation {
  block: string
  node: string
}

function blockElements(children: readonly import('domhandler').ChildNode[]): Element[] {
  const result: Element[] = []
  const visit = (nodes: readonly import('domhandler').ChildNode[]): void => {
    for (const node of nodes) {
      if (!isTag(node)) continue
      if (BLOCK_KINDS.has(node.name.toLowerCase())) result.push(node)
      visit(node.children)
    }
  }
  visit(children)
  return result
}

function hasLineNumbers(children: readonly import('domhandler').ChildNode[]): boolean {
  for (const node of children) {
    if (!isTag(node)) continue
    if (node.attribs['data-line-numbers'] !== undefined || hasLineNumbers(node.children)) return true
  }
  return false
}

export type LineNumbersState = 'set' | 'unset' | 'unsupported'

export function lineNumbersState(document: Pick<Document, 'kind' | 'settings'>): LineNumbersState {
  if (!(DOCUMENT_PROFILES[document.kind].settings as readonly string[]).includes('lineNumbers')) return 'unsupported'
  return document.settings?.lineNumbers === undefined ? 'unset' : 'set'
}

export type SideNotesState = 'set' | 'unset' | 'unsupported'

export function sideNotesState(document: Pick<Document, 'kind' | 'settings'>): SideNotesState {
  if (!(DOCUMENT_PROFILES[document.kind].settings as readonly string[]).includes('sideNotes')) return 'unsupported'
  return document.settings?.sideNotes === undefined ? 'unset' : 'set'
}

function lineNumberDocumentKinds(): string {
  const kinds = Object.entries(DOCUMENT_PROFILES)
    .filter(([, profile]) => (profile.settings as readonly string[]).includes('lineNumbers'))
    .map(([kind]) => kind)
  return kinds.length < 2 ? (kinds[0] ?? '') : `${kinds.slice(0, -1).join(', ')} or ${kinds.at(-1)}`
}

function sideNoteDocumentKinds(): string {
  const kinds = Object.entries(DOCUMENT_PROFILES)
    .filter(([, profile]) => (profile.settings as readonly string[]).includes('sideNotes'))
    .map(([kind]) => kind)
  return kinds.length < 2 ? (kinds[0] ?? '') : `${kinds.slice(0, -1).join(', ')} or ${kinds.at(-1)}`
}

function sideNoteAttributeIssues(children: readonly ChildNode[], where: string, parentRegion: boolean, flowing: boolean): string[] {
  const issues: string[] = []
  const visit = (nodes: readonly ChildNode[], insideSideNote: boolean): void => {
    for (const node of nodes) {
      if (!isTag(node)) continue
      const nodeWhere = `${where} <${node.name}>`
      const sideNote = node.attribs['data-side-note'] !== undefined
      if (sideNote) {
        issues.push(...SIDE_NOTE_ATTRIBUTE_FAMILY.issues(nodeWhere, node.attribs))
        if (parentRegion) issues.push(parentRegionAttributeIssue(nodeWhere, 'data-side-note'))
        else if (!flowing) {
          issues.push(
            `${nodeWhere} data-side-note cannot take effect because side notes belong to flowing content; move it to a flow or part's HTML, or a printed document's page body, to clear this refusal`,
          )
        } else if (insideSideNote) {
          issues.push(`${nodeWhere} data-side-note is nested inside another side note; remove one data-side-note attribute to clear this refusal`)
        }
      }
      visit(node.children, insideSideNote || sideNote)
    }
  }
  visit(children, false)
  return issues
}

function sideNoteElements(children: readonly ChildNode[]): Element[] {
  const result: Element[] = []
  const visit = (nodes: readonly ChildNode[]): void => {
    for (const node of nodes) {
      if (!isTag(node)) continue
      if (node.attribs['data-side-note'] !== undefined && !BLOCK_KINDS.has(node.name.toLowerCase())) result.push(node)
      visit(node.children)
    }
  }
  visit(children)
  return result
}

function lineNumberPlacementIssue(nodeWhere: string, parentRegion: boolean, flowing: boolean, topLevel: Element | undefined): string | undefined {
  if (parentRegion) return parentRegionAttributeIssue(nodeWhere, 'data-line-numbers')
  if (!flowing) {
    return `${nodeWhere} data-line-numbers cannot take effect because line numbers number flowing text; move it to a flow or part's HTML, or a printed document's page body, to clear this refusal`
  }
  if (topLevel) {
    return `${nodeWhere} data-line-numbers is nested inside <${topLevel.name}>; move it to the containing top-level <${topLevel.name}> to clear this refusal`
  }
  return undefined
}

function lineNumberAttributeIssues(children: readonly ChildNode[], where: string, parentRegion: boolean, flowing: boolean): string[] {
  const issues: string[] = []
  const visit = (nodes: readonly ChildNode[], topLevel: Element | undefined): void => {
    for (const node of nodes) {
      if (!isTag(node)) continue
      const nodeWhere = `${where} <${node.name}>`
      if (node.attribs['data-line-numbers'] !== undefined) {
        issues.push(...LINE_NUMBER_ATTRIBUTE_FAMILY.issues(nodeWhere, node.attribs))
        const placement = lineNumberPlacementIssue(nodeWhere, parentRegion, flowing, topLevel)
        if (placement) issues.push(placement)
      }
      visit(node.children, topLevel ?? node)
    }
  }
  visit(children, undefined)
  return issues
}

export function identifyBlockElements(elements: readonly Element[], node: string, newId: () => string, seen: Map<string, BlockIdLocation>): string[] {
  const added: string[] = []
  for (const element of elements) {
    let id = element.attribs['data-segnavia-id']
    if (!id) {
      id = newId()
      if (!id) throw new Error(`${node} could not mint a block id; return a non-empty id from newId to clear this refusal`)
      added.push(id)
    }
    const location = { node, block: `<${element.name}>` }
    const first = seen.get(id)
    if (first) {
      throw new Error(
        `block id "${id}" is shared by ${first.block} in ${first.node} and ${location.block} in ${location.node}; change or remove one data-segnavia-id to clear this refusal`,
      )
    }
    element.attribs['data-segnavia-id'] = id
    seen.set(id, location)
  }
  return added
}

export function identifyHtmlBlocks(
  html: string,
  node: string,
  newId: () => string,
  seen: Map<string, BlockIdLocation>,
  options: { parentRegion?: boolean; flowing?: boolean; insideNamedRegion?: string; lineNumbers?: LineNumbersState; sideNotes?: SideNotesState } = {},
): { html: string; added: string[] } {
  const tree = parse(html)
  const issues = sourceAttributeIssues(tree.children, node, [FIT_ATTRIBUTE_FAMILY, MEASURE_ATTRIBUTE_FAMILY], {
    ...(options.parentRegion ? { refusedFamilies: ['data-measure'] } : {}),
  })
  issues.push(...lineNumberAttributeIssues(tree.children, node, options.parentRegion === true, options.flowing ?? true))
  issues.push(...sideNoteAttributeIssues(tree.children, node, options.parentRegion === true, options.flowing ?? true))
  if (hasLineNumbers(tree.children)) {
    if ((options.lineNumbers ?? 'unset') === 'unset') {
      issues.push(`${node} data-line-numbers needs the document settings.lineNumbers setting; add that setting to clear this refusal`)
    } else if (options.lineNumbers === 'unsupported') {
      issues.push(
        `${node} data-line-numbers cannot take effect because this document kind does not number lines; use a ${lineNumberDocumentKinds()} document to clear this refusal`,
      )
    }
  }
  if (sideNoteElements(tree.children).length > 0 || blockElements(tree.children).some((element) => element.attribs['data-side-note'] !== undefined)) {
    if ((options.sideNotes ?? 'unset') === 'unset') {
      issues.push(`${node} data-side-note needs the document settings.sideNotes setting; add that setting to clear this refusal`)
    } else if (options.sideNotes === 'unsupported') {
      issues.push(
        `${node} data-side-note cannot take effect because this document kind does not place side notes; use a ${sideNoteDocumentKinds()} document to clear this refusal`,
      )
    }
  }
  issues.push(...fillAttributeIssues(tree.children, node, options.insideNamedRegion))
  if (issues.length) throw new RangeError(issues.join(' '))
  const added = identifyBlockElements(blockElements(tree.children), node, newId, seen)
  added.push(...identifyBlockElements(sideNoteElements(tree.children), node, newId, seen))
  return { html: serialize(tree), added }
}

export function blockElementsIncludingRoot(root: Element): Element[] {
  return [root, ...blockElements(root.children)]
}
