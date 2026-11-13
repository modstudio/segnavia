import { z } from 'zod'
import { ResolvedBook, refineBookPolicies } from './book.ts'
import { partDepthIssues } from './book-structure-policy.ts'

const DepthCheckedDocumentBook = z.preprocess((value, ctx) => {
  for (const issue of partDepthIssues(value)) ctx.addIssue({ code: 'custom', ...issue })
  return value
}, ResolvedBook.superRefine(refineBookPolicies))

export const DocumentLoweredBook = DepthCheckedDocumentBook.transform(({ bodyKey: _bodyKey, ...book }) => book)
