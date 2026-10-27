export const INK_BAND_PX = 8
export const INK_CHANNEL_TOLERANCE = 32

export interface InkImage {
  width: number
  height: number
  data: number[]
}

export interface PixelDiff {
  over: number
  worst: number
  shift: number
  dx: number
}

export function isInk(red: number, green: number, blue: number): boolean {
  return Math.min(red, green, blue) < 240
}

function sample(image: InkImage, x: number, y: number): [number, number, number] {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return [255, 255, 255]
  const index = (y * image.width + x) * 4
  return [image.data[index] ?? 255, image.data[index + 1] ?? 255, image.data[index + 2] ?? 255]
}

function channelDelta(left: [number, number, number], right: [number, number, number]): number {
  return Math.max(Math.abs(left[0] - right[0]), Math.abs(left[1] - right[1]), Math.abs(left[2] - right[2]))
}

export function diffAtShift(galley: InkImage, composed: InkImage, dx: number, dy: number): Omit<PixelDiff, 'shift' | 'dx'> {
  const height = Math.min(galley.height, composed.height)
  const width = Math.min(galley.width, composed.width)
  let over = 0
  let worst = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const fromGalley = sample(galley, x, y)
      const fromPage = sample(composed, x + dx, y + dy)
      if (!isInk(fromGalley[0], fromGalley[1], fromGalley[2]) && !isInk(fromPage[0], fromPage[1], fromPage[2])) continue
      const delta = channelDelta(fromGalley, fromPage)
      if (delta > worst) worst = delta
      if (delta > INK_CHANNEL_TOLERANCE) over += 1
    }
  }
  return { over, worst }
}

export function bestShift(galley: InkImage, composed: InkImage): PixelDiff {
  let best: PixelDiff = { over: Number.POSITIVE_INFINITY, worst: 0, shift: 0, dx: 0 }
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const diff = diffAtShift(galley, composed, dx, dy)
      const closer = Math.abs(dx) + Math.abs(dy) < Math.abs(best.dx) + Math.abs(best.shift)
      if (diff.over < best.over || (diff.over === best.over && closer)) best = { ...diff, shift: dy, dx }
    }
  }
  return best
}

export function inkBounds(image: InkImage): { count: number; minX: number; minY: number; maxX: number; maxY: number } {
  let count = 0
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const pixel = sample(image, x, y)
      if (!isInk(pixel[0], pixel[1], pixel[2])) continue
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
