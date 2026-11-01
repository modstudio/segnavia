import { type Book, type BookItem, isPart, isPlacedSection, type Placement } from '@segnavia/format'
import { type PlacementsOptions, resolvePlacements } from '@segnavia/html'
import type { ResolvedAsset } from './board-policy.ts'
import { bookPlacementWidth } from './placement-resolution.ts'
import { escapeHtml } from './svg.ts'

function cropAttribute(crop: Placement['crop']): string | undefined {
  if (!crop) return undefined
  return `${crop.top ?? 0} ${crop.right ?? 0} ${crop.bottom ?? 0} ${crop.left ?? 0}`
}

function placedImage(placement: Placement): string {
  const attributes = [
    `data-segnavia-media="${escapeHtml(placement.address)}"`,
    placement.page === undefined ? undefined : `data-segnavia-page="${escapeHtml(String(placement.page))}"`,
    placement.box === undefined ? undefined : `data-segnavia-box="${placement.box}"`,
    cropAttribute(placement.crop) === undefined ? undefined : `data-segnavia-crop="${escapeHtml(cropAttribute(placement.crop) as string)}"`,
    placement.alt === undefined ? undefined : `alt="${escapeHtml(placement.alt.text)}"`,
    placement.fit === undefined ? undefined : `style="object-fit:${placement.fit}"`,
  ].filter((attribute): attribute is string => attribute !== undefined)
  return `<img ${attributes.join(' ')}>`
}

async function resolvePlaced(
  placement: Placement,
  options: PlacementsOptions<ResolvedAsset>,
  purpose: 'screen' | 'print',
  width: number,
  signal: AbortSignal,
): Promise<BookItem> {
  let answer: ResolvedAsset | undefined
  try {
    answer = (await options.resolve(placement, { purpose, width, signal })) as ResolvedAsset | undefined
  } catch (error) {
    return {
      kind: 'designed',
      pages: [
        {
          html: await resolvePlacements(placedImage(placement), {
            resolvePlacement: async () => {
              throw error
            },
            report: options.report,
            purpose,
            width,
            signal,
          }),
        },
      ],
      contents: true,
    }
  }
  if (answer?.kind === 'page') return { kind: 'designed', pages: [{ html: answer.page.html }], contents: true }
  const html = await resolvePlacements(placedImage(placement), {
    resolvePlacement: async () => answer,
    report: options.report,
    purpose,
    width,
    signal,
  })
  return { kind: 'designed', pages: [{ html }], contents: true }
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
  return resolvePlaced(item.placement, options, purpose, width, signal)
}

export async function resolveBookEntries(
  book: Book,
  options: PlacementsOptions<ResolvedAsset> | undefined,
  purpose: 'screen' | 'print',
  signal: AbortSignal,
): Promise<Book> {
  if (!options) return book
  const width = bookPlacementWidth(book)
  const [frontMatter, body, endMatter] = await Promise.all([
    Promise.all(book.frontMatter.map((item) => resolveItem(item, options, purpose, width, signal))),
    Promise.all(book.body.map((item) => resolveItem(item, options, purpose, width, signal))),
    Promise.all(book.endMatter.map((item) => resolveItem(item, options, purpose, width, signal))),
  ])
  return { ...book, frontMatter, body, endMatter }
}
