import type { Media, MediaPage, PageBoxName, PageSelector } from './media.ts'

export const CSS_PIXELS_PER_POINT = 96 / 72
export const cssPixelsToPoints = (value: number): number => value / CSS_PIXELS_PER_POINT
export const pointsToCssPixels = (value: number): number => value * CSS_PIXELS_PER_POINT

export type PlacedPdfPageFailure = 'no-page'

export interface PlacedPdfPage {
  page: number
  name?: string
  box: PageBoxName
  sourceBounds: { x: number; y: number; width: number; height: number }
  bounds: { x: number; y: number; width: number; height: number }
}

const fallback: Record<PageBoxName, readonly PageBoxName[]> = {
  media: ['media'],
  crop: ['crop', 'media'],
  bleed: ['bleed', 'crop', 'media'],
  trim: ['trim', 'crop', 'media'],
  art: ['art', 'crop', 'media'],
}

function selectedPage(pages: readonly MediaPage[], selector: PageSelector | undefined): number {
  if (typeof selector === 'string') return pages.findIndex((page) => page.name === selector)
  return (selector ?? 1) - 1
}

/** Selects a PDF page and resolves its requested boundary using PDF box fallbacks. */
export function placedPdfPage(
  media: Pick<Media, 'format' | 'pages'>,
  selector?: PageSelector,
  requested: PageBoxName = 'crop',
): PlacedPdfPage | PlacedPdfPageFailure {
  if (media.format !== 'pdf' || !media.pages) return 'no-page'
  const index = selectedPage(media.pages, selector)
  const source = media.pages[index]
  if (!source) return 'no-page'
  const box = fallback[requested].find((name) => source.boxes[name] !== undefined) as PageBoxName
  const sourceBounds = source.boxes[box] as PlacedPdfPage['sourceBounds']
  const displayed = displayedPdfPage(sourceBounds, source.rotate, source.userUnit)
  return {
    page: index + 1,
    ...(source.name === undefined ? {} : { name: source.name }),
    box,
    sourceBounds,
    bounds: { x: 0, y: 0, width: displayed.width, height: displayed.height },
  }
}

export interface DisplayedPdfPage {
  width: number
  height: number
  matrix: readonly [number, number, number, number, number, number]
}

/** Maps a PDF box into displayed coordinates after /Rotate and /UserUnit. */
export function displayedPdfPage(bounds: PlacedPdfPage['bounds'], rotate = 0, userUnit = 1): DisplayedPdfPage {
  const rotation = ((rotate % 360) + 360) % 360
  const { x, y, width, height } = bounds
  if (rotation === 90) return { width: height * userUnit, height: width * userUnit, matrix: [0, -userUnit, userUnit, 0, -y * userUnit, (x + width) * userUnit] }
  if (rotation === 180)
    return {
      width: width * userUnit,
      height: height * userUnit,
      matrix: [-userUnit, 0, 0, -userUnit, (x + width) * userUnit, (y + height) * userUnit],
    }
  if (rotation === 270)
    return { width: height * userUnit, height: width * userUnit, matrix: [0, userUnit, -userUnit, 0, (y + height) * userUnit, -x * userUnit] }
  return { width: width * userUnit, height: height * userUnit, matrix: [userUnit, 0, 0, userUnit, -x * userUnit, -y * userUnit] }
}
