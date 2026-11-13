import { z } from 'zod'
import { BookShape } from './book.ts'
import { closedObject } from './closed-object.ts'
import { metadataExtraKeyIssue } from './metadata-extra-key.ts'

const DEFINED_FIELD_SHAPE = {
  title: z.string().refine((title) => title.trim().length > 0, {
    message: 'title must contain visible text; give a title with visible text or omit the metadata',
  }),
  authors: z.array(z.string()).optional(),
  subject: z.string().optional(),
  lang: BookShape.shape.lang,
}
export const DocumentMetadata = closedObject({
    ...DEFINED_FIELD_SHAPE,
    extra: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((metadata, ctx) => {
    for (const key of Object.keys(metadata.extra ?? {})) {
      const issue = metadataExtraKeyIssue(key)
      if (issue) ctx.addIssue({ code: 'custom', path: ['extra', key], message: issue })
    }
  })

export type DocumentMetadata = z.infer<typeof DocumentMetadata>
