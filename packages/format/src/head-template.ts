import { z } from 'zod'
import { Direction } from './direction.ts'

export const HeadTemplatePart = z.union([z.object({ variable: z.string().min(1) }), z.object({ record: z.string().min(1) })])
export const HeadTemplate = z.object({
  name: z.string().min(1),
  parts: z.array(HeadTemplatePart),
  separator: z.string().default(''),
  dropEmpty: z.boolean().default(true),
  collapseEqual: z.boolean().default(true),
  dir: Direction.optional(),
})
export type HeadTemplate = z.infer<typeof HeadTemplate>

export const LIBRARY_HEAD_TEMPLATES: HeadTemplate[] = [
  HeadTemplate.parse({ name: 'segnavia:running-head', parts: [{ variable: 'segnavia:section-title' }] }),
  HeadTemplate.parse({ name: 'segnavia:folio', parts: [{ variable: 'segnavia:folio' }] }),
]

export const HeadTemplates = z
  .array(HeadTemplate)
  .default([])
  .superRefine((templates, ctx) => {
    templates.forEach((template, index) => {
      if (template.name.startsWith('segnavia:'))
        ctx.addIssue({ code: 'custom', path: [index, 'name'], message: `head template name ${JSON.stringify(template.name)} is reserved for the library` })
    })
  })
  .transform((templates) => [...LIBRARY_HEAD_TEMPLATES, ...templates])
