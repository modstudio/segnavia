import type { z } from 'zod'
import { renderIssuePath } from './closed-object.ts'
import { contentHtml, dataAttributeValues, type HtmlLocation, htmlValues } from './document-html.ts'
import { walkDocumentNodes } from './document-node-refinement.ts'
import type { DocumentNode } from './document-nodes.ts'
import type { ParentPageNode, TemplateNode } from './document-nodes-book.ts'

interface EditionDocument {
  children: DocumentNode[]
  conditions: Array<{ name: string }>
  editions: Array<{ name: string; conditions: string[] }>
  defaultEdition?: string
  parentPages: ParentPageNode[]
  templates: TemplateNode[]
}

function unknownConditionIssue(subject: string, name: string): string {
  return `${subject} names unknown condition ${JSON.stringify(name)}; declare it or remove the reference to clear this refusal`
}

function conditionNames(value: string): string[] {
  return value.trim() === '' ? [] : value.trim().split(/\s+/)
}

function editionHtml(document: EditionDocument): HtmlLocation[] {
  return [
    ...contentHtml(document.children),
    ...document.templates.flatMap((template, index) => htmlValues({ ...template, type: 'template' }).map((html) => ({ html, path: ['templates', index] }))),
    ...document.parentPages.flatMap((parent, index) => htmlValues({ ...parent, type: 'parentPage' }).map((html) => ({ html, path: ['parentPages', index] }))),
  ]
}

export function refineDocumentEditions(document: EditionDocument, ctx: z.RefinementCtx): void {
  const declared = new Set(document.conditions.map((condition) => condition.name))
  const editions = new Set(document.editions.map((edition) => edition.name))
  if (document.conditions.length > 0 && document.defaultEdition === undefined) {
    ctx.addIssue({ code: 'custom', path: ['defaultEdition'], message: 'conditions need a defaultEdition; declare defaultEdition to clear this refusal' })
  }
  if (document.defaultEdition !== undefined && !editions.has(document.defaultEdition)) {
    ctx.addIssue({
      code: 'custom',
      path: ['defaultEdition'],
      message: `defaultEdition names unknown edition ${JSON.stringify(document.defaultEdition)}; declare it or name a declared edition to clear this refusal`,
    })
  }
  document.editions.forEach((edition, index) => {
    edition.conditions.forEach((name, conditionIndex) => {
      if (!declared.has(name)) {
        ctx.addIssue({
          code: 'custom',
          path: ['editions', index, 'conditions', conditionIndex],
          message: unknownConditionIssue(`edition ${JSON.stringify(edition.name)}`, name),
        })
      }
    })
  })
  walkDocumentNodes(document.children, (node, path) => {
    if (!('conditions' in node) || node.conditions === undefined) return
    node.conditions.forEach((name, index) => {
      if (!declared.has(name)) ctx.addIssue({ code: 'custom', path: [...path, 'conditions', index], message: unknownConditionIssue(`${node.type} node`, name) })
    })
  })
  for (const location of editionHtml(document)) {
    const renderedPath = renderIssuePath(location.path)
    for (const marker of dataAttributeValues(location.html, 'data-segnavia-condition')) {
      const names = conditionNames(marker)
      if (names.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: location.path,
          message: `${renderedPath}: data-segnavia-condition names no condition; name a declared condition or remove the attribute to clear this refusal`,
        })
      }
      for (const name of names) {
        if (declared.has(name)) continue
        ctx.addIssue({ code: 'custom', path: location.path, message: `${renderedPath}: ${unknownConditionIssue('data-segnavia-condition', name)}` })
      }
    }
  }
}
