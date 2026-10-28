import path from 'node:path'
import { BOOK_REGISTRATION_SEARCH, EFFECT_REGION_THRESHOLD, SCALE } from './config.ts'
import { alignmentOffset, difference, rgbPixels, sideBySide } from './image.ts'
import { READERS, readerPath, validateReaderProfile } from './readers.ts'
import { measureRegistration } from './registration.ts'
import type { Box, ReaderResult, RegionResult } from './types.ts'

function deviceBox(box: Box): Box {
  return { x: box.x * SCALE, y: box.y * SCALE, width: box.width * SCALE, height: box.height * SCALE }
}

export async function compareReaders(
  screen: string,
  comparisonPdf: string,
  directory: string,
  size: { width: number; height: number },
  regions: Array<{ name: string; box: Box }>,
  expectedMarker: number,
  executablePath: string,
  textWindow?: Box,
): Promise<ReaderResult[]> {
  const readerDirectory = path.join(directory, 'readers')
  const comparisonDirectory = path.join(directory, 'comparisons')
  const readers: ReaderResult[] = await Promise.all(
    READERS.map((reader) =>
      reader.render(comparisonPdf, readerPath(readerDirectory, reader.id), size.width, size.height, { executablePath, markerInset: expectedMarker }),
    ),
  )
  for (const reader of readers) validateReaderProfile(reader)
  const screenPixels = textWindow ? rgbPixels(screen, size.width, size.height) : undefined
  const body = textWindow ? deviceBox(textWindow) : undefined
  for (const reader of readers) {
    if (!reader.worked || !reader.image) continue
    reader.alignment = alignmentOffset(screen, reader.image, size.width, size.height, expectedMarker, expectedMarker)
    if (!reader.alignment.passed) {
      reader.worked = false
      reader.error = reader.alignment.error
      continue
    }
    reader.page = difference(screen, reader.image, size.width, size.height)
    if (screenPixels && body) {
      reader.registration = measureRegistration(
        screenPixels,
        rgbPixels(reader.image, size.width, size.height),
        size.width,
        size.height,
        body,
        BOOK_REGISTRATION_SEARCH,
      )
    }
    reader.regions = regions.map(({ name, box }) => {
      const x = Math.max(0, box.x * SCALE)
      const y = Math.max(0, box.y * SCALE)
      const scaled = {
        x,
        y,
        width: Math.max(0, Math.min(box.width * SCALE, size.width - x)),
        height: Math.max(0, Math.min(box.height * SCALE, size.height - y)),
      }
      const result: RegionResult = { name, box: scaled, ...difference(screen, reader.image as string, size.width, size.height, scaled) }
      if (result.mean > EFFECT_REGION_THRESHOLD.mean || result.p99 > EFFECT_REGION_THRESHOLD.p99) {
        result.sideBySide = path.join(comparisonDirectory, `${reader.reader}-${name}.png`)
        sideBySide(screen, reader.image as string, scaled, result.sideBySide)
      }
      return result
    })
  }
  return readers
}
