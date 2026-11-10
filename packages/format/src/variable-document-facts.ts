import { z } from 'zod'

export const VariableDocumentMetadata = z.object({
  title: z.string().optional(),
  subject: z.string().optional(),
  authors: z.array(z.string()).optional(),
  extra: z.record(z.string(), z.string()).optional(),
})

export const VariableDocumentFacts = z.object({
  lang: z.string().optional(),
  metadata: VariableDocumentMetadata.optional(),
})
export type VariableDocumentFacts = z.infer<typeof VariableDocumentFacts>

type StandardMetaReader = (metadata: z.infer<typeof VariableDocumentMetadata>, lang: string | undefined) => string

export const STANDARD_META_FIELD_READERS = {
  title: (metadata) => metadata.title ?? '',
  subject: (metadata) => metadata.subject ?? '',
  authors: (metadata, lang) => new Intl.ListFormat(lang, { style: 'long', type: 'conjunction' }).format(metadata.authors ?? []),
} satisfies Record<string, StandardMetaReader>

export type StandardMetaField = keyof typeof STANDARD_META_FIELD_READERS

export function variableReadsDocumentFacts(variable: { kind: string }): boolean {
  return variable.kind === 'meta'
}

export function bookVariableDocumentFacts(book: {
  lang?: string
  title: string
  subject?: string
  authors?: string[]
  extra?: Record<string, string>
}): VariableDocumentFacts {
  return { lang: book.lang, metadata: { title: book.title, subject: book.subject, authors: book.authors, extra: book.extra } }
}
