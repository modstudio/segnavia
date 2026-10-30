export const INK_BAND_PX = 8
// A pixel is ink when min(R,G,B) < 240. It matches if the other band has ink within 1 CSS pixel.
export const INK_NEIGHBORHOOD_PX = 1
export const INK_PIXEL_TOLERANCE = 30

export interface InkImage {
  width: number
  height: number
  data: number[]
}

export interface InkBand {
  image: InkImage
  countedRows: { start: number; end: number }
}

export interface PixelDiff {
  over: number
  lost: number
  extra: number
}

export function bandHeight(windowHeight: number): number {
  return Math.max(1, Math.min(INK_BAND_PX, Math.floor(windowHeight)))
}

export function bandCaptureHeight(windowHeight: number): number {
  const band = bandHeight(windowHeight)
  return band + Math.min(INK_NEIGHBORHOOD_PX, Math.max(0, Math.floor(windowHeight) - band))
}

export function countedBand(image: InkImage, side: 'start' | 'end', countedHeight: number): InkBand {
  const height = Math.min(countedHeight, image.height)
  return {
    image,
    countedRows: side === 'start' ? { start: 0, end: height } : { start: image.height - height, end: image.height },
  }
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

export function presenceDiff(galley: InkBand, composed: InkBand): PixelDiff {
  const width = Math.min(galley.image.width, composed.image.width)
  let lost = 0
  let extra = 0
  for (let y = galley.countedRows.start; y < galley.countedRows.end; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (inkAt(galley.image, x, y) && !nearbyInk(composed.image, x, y)) lost += 1
    }
  }
  for (let y = composed.countedRows.start; y < composed.countedRows.end; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (inkAt(composed.image, x, y) && !nearbyInk(galley.image, x, y)) extra += 1
    }
  }
  return { over: lost + extra, lost, extra }
}

export function inkBounds(band: InkBand): { count: number; minX: number; minY: number; maxX: number; maxY: number } {
  const { image } = band
  let count = 0
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1
  for (let y = band.countedRows.start; y < band.countedRows.end; y += 1) {
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

export function inkCount(band: InkBand): number {
  return inkBounds(band).count
}

export function stackImages(top: InkBand, bottom: InkBand): InkBand {
  const width = Math.min(top.image.width, bottom.image.width)
  const height = top.image.height + bottom.image.height
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
  write(top.image, 0)
  write(bottom.image, top.image.height)
  return {
    image: { width, height, data },
    countedRows: { start: top.countedRows.start, end: top.image.height + bottom.countedRows.end },
  }
}
