import { type Book, type BookItem, isPart, isPlacedSection, type PlacedSection, pageOrPrintedFromInput } from '@segnavia/format'
import { PLACEMENT_ATTRIBUTES, type PlacementsOptions, placementCropEdges, resolvePageHtml, resolvePlacements } from '@segnavia/html'
import type { ResolvedAsset } from './board-policy.ts'
import { bookPlacementWidth } from './placement-resolution.ts'
import { escapeHtml } from './svg.ts'

const [MEDIA_ATTRIBUTE, PAGE_ATTRIBUTE, BOX_ATTRIBUTE, CROP_ATTRIBUTE] = PLACEMENT_ATTRIBUTES

function placedImage(placement: PlacedSection['placement']): string {
  const crop = placementCropEdges(placement.crop)
  const attributes = [
    `${MEDIA_ATTRIBUTE}="${escapeHtml(placement.address)}"`,
    placement.page === undefined ? undefined : `${PAGE_ATTRIBUTE}="${escapeHtml(String(placement.page))}"`,
    placement.box === undefined ? undefined : `${BOX_ATTRIBUTE}="${placement.box}"`,
    crop === undefined ? undefined : `${CROP_ATTRIBUTE}="${escapeHtml(crop)}"`,
    placement.alt === undefined ? undefined : `alt="${escapeHtml(placement.alt.text)}"`,
    placement.fit === undefined ? undefined : `style="object-fit:${placement.fit}"`,
  ].filter((attribute): attribute is string => attribute !== undefined)
  return `<img ${attributes.join(' ')}>`
}

function designed(entry: PlacedSection, html: string): BookItem {
  const { title, contents, opens, parents } = entry
  return { kind: 'designed', title, contents, opens, parents, pages: [{ html }] }
}

async function resolvePlaced(
  entry: PlacedSection,
  options: PlacementsOptions<ResolvedAsset>,
  purpose: 'screen' | 'print',
  width: number,
  signal: AbortSignal,
): Promise<BookItem> {
  const placement = entry.placement
  let answer: ResolvedAsset | undefined
  try {
    answer = (await options.resolve(placement, { purpose, width, signal })) as ResolvedAsset | undefined
  } catch (error) {
    return designed(
      entry,
      await resolvePlacements(placedImage(placement), {
        resolvePlacement: async () => {
          throw error
        },
        report: options.report,
        purpose,
        width,
        signal,
      }),
    )
  }
  if (answer?.kind === 'page') return designed(entry, resolvePageHtml(pageOrPrintedFromInput(answer.page)).html)
  const html = await resolvePlacements(placedImage(placement), {
    resolvePlacement: async () => answer,
    report: options.report,
    purpose,
    width,
    signal,
  })
  return designed(entry, html)
}

async function resolveItem(
  item: BookItem,
  options: PlacementsOptions<ResolvedAsset>,
  purpose: 'screen' | 'print',
  width: number,
  signal: AbortSignal,
): Promise<BookItem> {
  if (isPart(item)) return { ...item, children: await Promise.all(item.children.map((child) => resolveItem(child, options, purpose, width, signal))) }
  if (!isPlacedSection(item)) return item
  return resolvePlaced(item, options, purpose, width, signal)
}

function firstPlacedPath(book: Book): (string | number)[] | undefined {
  const visit = (items: BookItem[], path: (string | number)[]): (string | number)[] | undefined => {
    for (const [index, item] of items.entries()) {
      const itemPath = [...path, index]
      if (isPlacedSection(item)) return itemPath
      if (isPart(item)) {
        const nested = visit(item.children, [...itemPath, 'children'])
        if (nested) return nested
      }
    }
    return undefined
  }
  return visit(book.frontMatter, ['frontMatter']) ?? visit(book.body, ['body']) ?? visit(book.endMatter, ['endMatter'])
}

export async function resolveBookEntries(
  book: Book,
  options: PlacementsOptions<ResolvedAsset> | undefined,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
): Promise<Book> {
  const placedPath = firstPlacedPath(book)
  if (!options && !placedPath) return book
  if (!options && purpose === 'print') {
    throw new Error(`${placedPath?.join('.')} is a placed entry; pass placements to resolve placed entries`)
  }
  const activeOptions =
    options ??
    ({
      resolve: async () => undefined,
    } satisfies PlacementsOptions<ResolvedAsset>)
  const width = bookPlacementWidth(book)
  const [frontMatter, body, endMatter] = await Promise.all([
    Promise.all(book.frontMatter.map((item) => resolveItem(item, activeOptions, purpose, width, signal))),
    Promise.all(book.body.map((item) => resolveItem(item, activeOptions, purpose, width, signal))),
    Promise.all(book.endMatter.map((item) => resolveItem(item, activeOptions, purpose, width, signal))),
  ])
  return { ...book, frontMatter, body, endMatter }
}
