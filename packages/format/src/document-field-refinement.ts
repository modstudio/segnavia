import type { z } from 'zod'
import { renamedParentRulesFieldIssue } from './parent-rules.ts'

interface UnsupportedDocumentFields {
  rules?: unknown
  templates: readonly { parents?: unknown }[]
}

export function refineUnsupportedDocumentFields(document: UnsupportedDocumentFields, ctx: z.RefinementCtx): void {
  if (document.rules !== undefined) {
    ctx.addIssue({ code: 'custom', ...renamedParentRulesFieldIssue('document field rules', ['rules']) })
  }
  document.templates.forEach((template, index) => {
    if (template.parents !== undefined) {
      ctx.addIssue({ code: 'custom', ...renamedParentRulesFieldIssue('template field parents', ['templates', index, 'parents']) })
    }
  })
}
