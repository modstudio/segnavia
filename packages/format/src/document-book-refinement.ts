import type { z } from 'zod'
import type { DocumentNode } from './document-nodes.ts'

type BookDocument = { children: DocumentNode[] }
type Division = 'front' | 'body' | 'end'

function unsupported(path: (string | number)[], subject: string, ctx: z.RefinementCtx): void {
  ctx.addIssue({ code: 'custom', path, message: `${subject} is not yet supported; remove it to clear this refusal` })
}

function refineBookPages(section: Extract<DocumentNode, { type: 'section' }>, path: (string | number)[], ctx: z.RefinementCtx): void {
  const pages = section.children.filter((child) => child.type === 'page')
  const templated = pages.some((page) => page.regions !== undefined)
  if (section.template !== undefined && !templated) unsupported([...path, 'template'], 'non-templated section field template', ctx)
  if (templated && pages.some((page) => page.regions === undefined)) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'children'],
      message: 'a templated section needs regions on every page; add regions to every page or remove them from every page to clear this refusal',
    })
  }
  if (templated && section.template === undefined) {
    ctx.addIssue({ code: 'custom', path: [...path, 'template'], message: 'a templated section needs template; name a template to clear this refusal' })
  }
  pages.forEach((page, pageIndex) => {
    if (templated && page.body !== undefined) unsupported([...path, 'children', pageIndex, 'body'], 'templated page field body', ctx)
    if (!templated && page.template !== undefined) unsupported([...path, 'children', pageIndex, 'template'], 'designed page field template', ctx)
    if (!templated && (!page.body || !('html' in page.body))) {
      ctx.addIssue({
        code: 'custom',
        path: [...path, 'children', pageIndex, 'body'],
        message: 'a designed book page needs body.html; provide an HTML body to clear this refusal',
      })
    }
  })
}

function refineBookSection(section: Extract<DocumentNode, { type: 'section' }>, division: Division, path: (string | number)[], ctx: z.RefinementCtx): void {
  const kinds = new Set(section.children.map((child) => child.type))
  if (kinds.size !== 1 || !['page', 'flow', 'placed'].includes(section.children[0]?.type ?? '')) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'children'],
      message: 'a book section needs only page nodes, one flow node or one placed node; keep one supported child form to clear this refusal',
    })
  }
  if ((kinds.has('flow') || kinds.has('placed')) && section.children.length !== 1) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'children'],
      message: 'a flowing or placed book section needs exactly one child; keep one child to clear this refusal',
    })
  }
  const flow = section.children[0]?.type === 'flow' ? section.children[0] : undefined
  if (flow && division === 'body' && section.title === undefined && flow.title === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'title'],
      message: 'a body section needs a title; provide section.title or flow.title to clear this refusal',
    })
  }
  if (flow && section.title !== undefined && flow.title !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: [...path, 'children', 0, 'title'],
      message: 'section.title and flow.title were both given; keep section.title and remove flow.title to clear this refusal',
    })
  }
  if (flow && division === 'body' && section.contents === false) unsupported([...path, 'contents'], 'body flow section field contents', ctx)
  refineBookPages(section, path, ctx)
}

function refineBookEntries(
  nodes: DocumentNode[],
  division: Division,
  path: (string | number)[],
  contentsOptions: { count: number },
  ctx: z.RefinementCtx,
): void {
  nodes.forEach((node, index) => {
    const nodePath = [...path, index]
    if (node.type === 'division') {
      ctx.addIssue({
        code: 'custom',
        path: [...nodePath, 'type'],
        message: 'a division node is only allowed at the book root; move it to the root or remove it to clear this refusal',
      })
      return
    }
    if (node.type === 'part') {
      refineBookEntries(node.children, division, [...nodePath, 'children'], contentsOptions, ctx)
      return
    }
    if (node.type === 'section') {
      refineBookSection(node, division, nodePath, ctx)
      return
    }
    refineBookLeaf(node, division, nodePath, contentsOptions, ctx)
  })
}

function refineBookLeaf(node: DocumentNode, division: Division, nodePath: (string | number)[], contentsOptions: { count: number }, ctx: z.RefinementCtx): void {
  if (!['contents', 'flow', 'placed'].includes(node.type)) {
    ctx.addIssue({
      code: 'custom',
      path: [...nodePath, 'type'],
      message: `node ${node.type} cannot lower to a book entry; put it inside a supported section to clear this refusal`,
    })
  }
  if (node.type === 'contents' && (node.depth !== undefined || node.pageNumbers !== undefined)) {
    contentsOptions.count += 1
    if (contentsOptions.count > 1) {
      ctx.addIssue({
        code: 'custom',
        path: node.depth !== undefined ? [...nodePath, 'depth'] : [...nodePath, 'pageNumbers'],
        message: 'only one contents node may set depth or pageNumbers; keep those options on one contents node to clear this refusal',
      })
    }
  }
  if (node.type === 'flow' && division === 'body' && node.title === undefined) {
    ctx.addIssue({ code: 'custom', path: [...nodePath, 'title'], message: 'a body flow needs a title; provide title to clear this refusal' })
  }
}

export function refineBookNodes(document: BookDocument, ctx: z.RefinementCtx): void {
  const divisions = document.children.filter((node) => node.type === 'division')
  if (divisions.length > 0 && divisions.length !== document.children.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['children'],
      message:
        'a book document cannot mix division nodes with other top-level nodes; move every top-level entry into a division or remove the divisions to clear this refusal',
    })
  }
  const contentsOptions = { count: 0 }
  if (divisions.length === 0) {
    refineBookEntries(document.children, 'body', ['children'], contentsOptions, ctx)
    return
  }
  divisions.forEach((division, index) => {
    if (division.settings?.numbering !== undefined) {
      unsupported(['children', index, 'settings', 'numbering'], 'division field settings.numbering', ctx)
    }
    refineBookEntries(division.children, division.name, ['children', index, 'children'], contentsOptions, ctx)
  })
}
