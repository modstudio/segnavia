import { type Book, type Folio, pageNotPrintedRefusal, sequenceFolios } from '@segnavia/format'
import type { BookSectionInfo } from '@segnavia/html'
import type { BookDestination } from './book-destinations.ts'
import { RenderRefusedError } from './errors.ts'

export function folioTextAt(folios: readonly Folio[], page: number): string {
  const folio = folios[page - 1]
  if (!folio) throw new RangeError(`Printed page ${page} has no computed folio.`)
  return folio.printed ? folio.text : ''
}

function destinationOwner(id: string, destination: BookDestination, sections: BookSectionInfo[], destinations: Map<string, BookDestination>): string {
  const owner = sections
    .flatMap((section) => {
      const start = destinations.get(section.id)
      return start && start.page <= destination.page ? [{ section, start }] : []
    })
    .sort((left, right) => left.start.page - right.start.page)
    .at(-1)?.section
  return owner ? `${owner.title ?? owner.id} (${owner.id})` : id
}

export type FrontPrintStatus = { status: 'more' } | { status: 'stable' } | { status: 'refused'; message: string }

export function frontPrintStatus(prints: Map<string, BookDestination>[], ids: string[], sections: BookSectionInfo[]): FrontPrintStatus {
  if (prints.length < 2) return { status: 'more' }
  const expected = prints.at(-2) as Map<string, BookDestination>
  const actual = prints.at(-1) as Map<string, BookDestination>
  for (const id of ids) {
    const before = expected.get(id)
    const after = actual.get(id)
    if (!before || !after || before.page === after.page) continue
    if (prints.length < 3) return { status: 'more' }
    const owner = destinationOwner(id, before, sections, expected)
    return { status: 'refused', message: `Front destination ${id} in ${owner} moved from page ${before.page} to page ${after.page} after three prints.` }
  }
  return { status: 'stable' }
}

interface NumberSource {
  destinations: Map<string, BookDestination>
  system: Book['numbering']['body']
  printed: boolean
  division: 'frontMatter' | 'body'
}

function numberFromSource(
  id: string,
  source: NumberSource & { folios: Folio[] },
  headings: ReadonlySet<string>,
  pageReferences: ReadonlySet<string>,
): string | undefined {
  const page = source.destinations.get(id)?.page
  if (page === undefined) return undefined
  const folio = source.folios[page - 1]
  if (!folio) throw new RangeError(`Printed page ${page} has no computed folio.`)
  if (!folio.printed && (pageReferences.has(id) || !headings.has(id))) {
    throw new RenderRefusedError(pageNotPrintedRefusal(id, source.division))
  }
  return folio.printed ? folio.text : ''
}

export function finalNumbers(ids: string[], sources: NumberSource[], headings = new Set<string>(), pageReferences = new Set<string>()): Record<string, string> {
  const numberedSources = sources.map((source) => {
    const pages = Math.max(0, ...[...source.destinations.values()].map((destination) => destination.page))
    return { ...source, folios: sequenceFolios(pages, source.system, source.printed) }
  })
  return Object.fromEntries(
    ids.map((id) => {
      for (const source of numberedSources) {
        const number = numberFromSource(id, source, headings, pageReferences)
        if (number !== undefined) return [id, number]
      }
      const role = headings.has(id) ? 'heading' : 'page reference target'
      throw new RenderRefusedError(`The ${role} ${id} has no printed destination; keep its destination in the printed book to clear this refusal.`)
    }),
  )
}

function sameNumbers(left: Record<string, string>, right: Record<string, string>): boolean {
  return Object.keys(left).length === Object.keys(right).length && Object.entries(left).every(([id, number]) => right[id] === number)
}

export type PageReferencePrintStatus = { status: 'stable' } | { status: 'more' } | { status: 'refused'; message: string }

export function pageReferencePrintStatus(expected: Record<string, string>, actual: Record<string, string>, reprints: number): PageReferencePrintStatus {
  if (sameNumbers(expected, actual)) return { status: 'stable' }
  if (reprints < 3) return { status: 'more' }
  const moved = Object.keys(actual).filter((id) => expected[id] !== actual[id])
  return {
    status: 'refused',
    message: `Body page references to ${moved.join(', ')} did not converge after three reprints; shorten the referenced content or reserve fixed space for page references to clear this refusal.`,
  }
}

export type BookPartsPrintStatus = { status: 'stable' } | { status: 'more' } | { status: 'refused'; message: string }

export function bookPartsPrintStatus(expected: Record<string, string>, actual: Record<string, string>, alternations: number): BookPartsPrintStatus {
  if (sameNumbers(expected, actual)) return { status: 'stable' }
  if (alternations < 3) return { status: 'more' }
  const moved = Object.keys(actual).filter((id) => expected[id] !== actual[id])
  return {
    status: 'refused',
    message: `Front and body page references to ${moved.join(', ')} did not converge after three alternations; shorten the referenced content or reserve fixed space for page references to clear this refusal.`,
  }
}
