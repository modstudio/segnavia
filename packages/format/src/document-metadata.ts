import { z } from 'zod'
import { BookShape } from './book.ts'

const DEFINED_FIELD_SHAPE = {
  title: z.string().refine((title) => title.trim().length > 0, {
    message: 'title must contain visible text; give a title with visible text or omit the metadata',
  }),
  authors: z.array(z.string()).optional(),
  subject: z.string().optional(),
  lang: BookShape.shape.lang,
}
const DEFINED_FIELDS = new Set(Object.keys(DEFINED_FIELD_SHAPE))
const STANDARD_PDF_INFO_KEYS = new Set(['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate', 'Trapped'])
const ASCII_XML_LOCAL_NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/

export const DocumentMetadata = z
  .object({
    ...DEFINED_FIELD_SHAPE,
    extra: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((metadata, ctx) => {
    for (const key of Object.keys(metadata.extra ?? {})) {
      if (DEFINED_FIELDS.has(key)) {
        ctx.addIssue({ code: 'custom', path: ['extra', key], message: `extra key "${key}" collides with the defined field "${key}"; remove it from extra` })
      } else if (STANDARD_PDF_INFO_KEYS.has(key)) {
        ctx.addIssue({ code: 'custom', path: ['extra', key], message: `extra key "${key}" is a standard PDF Info key; choose another name` })
      } else if (!ASCII_XML_LOCAL_NAME.test(key)) {
        ctx.addIssue({ code: 'custom', path: ['extra', key], message: `extra key "${key}" is not an ASCII XML local name; use an ASCII XML local name` })
      }
    }
  })

export type DocumentMetadata = z.infer<typeof DocumentMetadata>
