import type { Direction, TextDirection } from './direction.ts'
import { htmlTextSample, resolveDirection } from './direction.ts'

/** Resolves the direction of a page from its metadata and visible HTML text. */
export function pageDirection(page: { dir?: Direction; lang?: string; html: string }): TextDirection {
  return resolveDirection(page.dir, page.lang, htmlTextSample(page.html))
}
