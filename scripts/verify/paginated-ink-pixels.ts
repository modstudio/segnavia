export const INK_BAND_PX = 40
export const INK_COMPARE_PX = 8
// A pixel is ink when min(R,G,B) < 240. It matches if the other band has ink within 1 CSS pixel.
export const INK_NEIGHBORHOOD_PX = 1

export interface InkImage {
  width: number
  height: number
  data: number[]
}

export interface PixelDiff {
  over: number
  lost: number
  extra: number
}

export function isInk(red: number, green: number, blue: number): boolean {
  return Math.min(red, green, blue) < 240
}

function inkAt(image: InkImage, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return false
  const index = (y * image.width + x) * 4
  return isInk(image.data[index] ?? 255, image.data[index + 1] ?? 255, image.data[index + 2] ?? 255)
}

function nearbyInk(image: InkImage, x: number, y: number): boolean {
  for (let dy = -INK_NEIGHBORHOOD_PX; dy <= INK_NEIGHBORHOOD_PX; dy += 1) {
    for (let dx = -INK_NEIGHBORHOOD_PX; dx <= INK_NEIGHBORHOOD_PX; dx += 1) {
      if (inkAt(image, x + dx, y + dy)) return true
    }
  }
  return false
}

function firstInkRow(image: InkImage): number {
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (inkAt(image, x, y)) return y
    }
  }
  return -1
}

function lastInkRow(image: InkImage): number {
  for (let y = image.height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (inkAt(image, x, y)) return y
    }
  }
  return -1
}

function cropRows(image: InkImage, from: number, height: number): InkImage {
  const start = Math.max(0, from)
  const held = Math.max(0, Math.min(height, image.height - start))
  return { width: image.width, height: held, data: image.data.slice(start * image.width * 4, (start + held) * image.width * 4) }
}

export function presenceDiff(galley: InkImage, composed: InkImage): PixelDiff {
  const height = Math.min(galley.height, composed.height)
  const width = Math.min(galley.width, composed.width)
  let lost = 0
  let extra = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const inGalley = inkAt(galley, x, y)
      const inPage = inkAt(composed, x, y)
      if (inGalley && !nearbyInk(composed, x, y)) lost += 1
      if (inPage && !nearbyInk(galley, x, y)) extra += 1
    }
  }
  return { over: lost + extra, lost, extra }
}

const EMPTY: PixelDiff = { over: 0, lost: 0, extra: 0 }

function missing(image: InkImage, lost: boolean): PixelDiff {
  const count = image.width * Math.max(1, image.height)
  return lost ? { over: count, lost: count, extra: 0 } : { over: count, lost: 0, extra: count }
}

export function edgePresence(galley: InkImage, composed: InkImage, side: 'start' | 'end' | 'break'): PixelDiff {
  if (side === 'break') return presenceDiff(galley, composed)
  if (side === 'start') {
    const galleyRow = firstInkRow(galley)
    const pageRow = firstInkRow(composed)
    if (galleyRow < 0 && pageRow < 0) return EMPTY
    if (galleyRow < 0) return missing(composed, false)
    if (pageRow < 0) return missing(galley, true)
    return presenceDiff(cropRows(galley, galleyRow, INK_COMPARE_PX), cropRows(composed, pageRow, INK_COMPARE_PX))
  }
  const galleyRow = lastInkRow(galley)
  const pageRow = lastInkRow(composed)
  if (galleyRow < 0 && pageRow < 0) return EMPTY
  if (galleyRow < 0) return missing(composed, false)
  if (pageRow < 0) return missing(galley, true)
  return presenceDiff(cropRows(galley, galleyRow - INK_COMPARE_PX + 1, INK_COMPARE_PX), cropRows(composed, pageRow - INK_COMPARE_PX + 1, INK_COMPARE_PX))
}

export function inkBounds(image: InkImage): { count: number; minX: number; minY: number; maxX: number; maxY: number } {
  let count = 0
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (!inkAt(image, x, y)) continue
      count += 1
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  return { count, minX, minY, maxX, maxY }
}

export function inkCount(image: InkImage): number {
  return inkBounds(image).count
}

export function stackImages(top: InkImage, bottom: InkImage): InkImage {
  const width = Math.min(top.width, bottom.width)
  const height = top.height + bottom.height
  const data = new Array(width * height * 4).fill(255)
  const write = (source: InkImage, y0: number) => {
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const from = (y * source.width + x) * 4
        const to = ((y0 + y) * width + x) * 4
        data[to] = source.data[from] ?? 255
        data[to + 1] = source.data[from + 1] ?? 255
        data[to + 2] = source.data[from + 2] ?? 255
        data[to + 3] = 255
      }
    }
  }
  write(top, 0)
  write(bottom, top.height)
  return { width, height, data }
}
