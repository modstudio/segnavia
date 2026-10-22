import { PDFName, PDFNumber, type PDFObject, PDFRawStream } from 'pdf-lib'
import type { Page as Tab } from 'playwright-core'
import { RenderRefusedError } from '../errors.ts'
import type { RenderOptions } from '../options.ts'
import { loadPdf } from '../pdf-load.ts'
import { BACKDROP_RASTER_IMAGE_KEY, GENERATED_EFFECT_IMAGE_KEY } from './types.ts'

export const DEFAULT_RASTER_DPI = 150
export const DEFAULT_RASTER_QUALITY = 85
export const MIN_RASTER_DPI = 72
export const MAX_RASTER_DPI = 600
export const MIN_RASTER_QUALITY = 1
export const MAX_RASTER_QUALITY = 100
export const MAX_RASTER_REGION_PIXELS = 50_000_000
export const MAX_RASTER_TOTAL_PIXELS = 400_000_000
export const MAX_RASTER_REGION_BYTES = 200_000_000
export const MAX_RASTER_TOTAL_BYTES = 800_000_000
export const CSS_PIXELS_PER_INCH = 96

export interface RasterSettings {
  dpi: number
  quality: number
}

export interface RasterBox {
  x: number
  y: number
  width: number
  height: number
}

interface RasterCandidate extends RasterBox {
  dpi: number
  id: string
}

interface RasterCapture {
  bytes: Uint8Array
  height: number
  width: number
}

const ICC_PROFILE_SIGNATURE = Uint8Array.from([0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45, 0])
const standaloneJpegMarker = (marker: number): boolean => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)
const iccProfileSegment = (bytes: Uint8Array, marker: number, payload: number): boolean =>
  marker === 0xe2 && ICC_PROFILE_SIGNATURE.every((value, index) => value === bytes[payload + index])

export function stripJpegIccProfile(bytes: Uint8Array): Uint8Array {
  const kept: Uint8Array[] = []
  let start = 0
  let offset = 2
  while (offset + 3 < bytes.length && bytes[offset] === 0xff) {
    let codeOffset = offset + 1
    while (bytes[codeOffset] === 0xff) codeOffset++
    const marker = bytes[codeOffset] ?? 0
    const afterMarker = codeOffset + 1
    if (marker === 0xda || marker === 0xd9) break
    if (standaloneJpegMarker(marker)) {
      offset = afterMarker
      continue
    }
    const length = ((bytes[afterMarker] ?? 0) << 8) | (bytes[afterMarker + 1] ?? 0)
    const end = afterMarker + length
    if (length < 2 || end > bytes.length) break
    if (iccProfileSegment(bytes, marker, afterMarker + 2)) {
      kept.push(bytes.subarray(start, offset))
      start = end
    }
    offset = end
  }
  if (start === 0) return bytes
  kept.push(bytes.subarray(start))
  const length = kept.reduce((total, part) => total + part.length, 0)
  const stripped = new Uint8Array(length)
  let position = 0
  for (const part of kept) {
    stripped.set(part, position)
    position += part.length
  }
  return stripped
}

export function jpegPixelSize(bytes: Uint8Array): { width: number; height: number } {
  for (let offset = 2; offset + 8 < bytes.length; ) {
    if (bytes[offset] !== 0xff) break
    const marker = bytes[offset + 1] ?? 0
    offset += 2
    if (marker === 0xd8 || marker === 0xd9) continue
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)
    if (length < 2 || offset + length > bytes.length) break
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0),
        width: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
      }
    }
    offset += length
  }
  throw new RenderRefusedError('Chromium produced an unsupported backdrop raster JPEG; supported: a JPEG with a pixel-size frame header.')
}

const refuseRange = (name: string, value: number, minimum: number, maximum: number): never => {
  throw new RenderRefusedError(
    `The backdrop raster ${name} is ${value}; supported: a ${name} from ${minimum} to ${maximum}. Set effects.raster.${name} or --segnavia-raster-dpi within that range to clear this refusal.`,
  )
}

function bounded(name: 'dpi' | 'quality', value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) refuseRange(name, value, minimum, maximum)
  return value
}

export function rasterSettings(raster: Exclude<RenderOptions['effects'], false | undefined>['raster']): RasterSettings {
  return {
    dpi: bounded('dpi', raster?.dpi ?? DEFAULT_RASTER_DPI, MIN_RASTER_DPI, MAX_RASTER_DPI),
    quality: bounded('quality', raster?.quality ?? DEFAULT_RASTER_QUALITY, MIN_RASTER_QUALITY, MAX_RASTER_QUALITY),
  }
}

export function elementRasterDpi(value: string, fallback: number): number {
  const trimmed = value.trim()
  return trimmed === '' ? fallback : bounded('dpi', Number(trimmed), MIN_RASTER_DPI, MAX_RASTER_DPI)
}

export function rasterPixelSize(box: Pick<RasterBox, 'width' | 'height'>, dpi: number): { width: number; height: number; pixels: number } {
  const width = Math.max(1, Math.ceil((box.width * dpi) / CSS_PIXELS_PER_INCH))
  const height = Math.max(1, Math.ceil((box.height * dpi) / CSS_PIXELS_PER_INCH))
  return { width, height, pixels: width * height }
}

export function pdfRasterBox(box: RasterBox, pageHeight: number, scale = 1, offset: Pick<RasterBox, 'x' | 'y'> = { x: 0, y: 0 }): RasterBox {
  return {
    x: offset.x + box.x * scale,
    y: pageHeight - offset.y - (box.y + box.height) * scale,
    width: box.width * scale,
    height: box.height * scale,
  }
}

export function chargeRasterPixels(total: number, pixels: number): number {
  if (pixels > MAX_RASTER_REGION_PIXELS)
    throw new RenderRefusedError(
      `The backdrop raster region has ${pixels} pixels; the ceiling is ${MAX_RASTER_REGION_PIXELS} pixels. Reduce the element size or --segnavia-raster-dpi to clear this refusal.`,
    )
  const next = total + pixels
  if (next > MAX_RASTER_TOTAL_PIXELS)
    throw new RenderRefusedError(
      `The backdrop raster regions have ${next} total pixels; the ceiling is ${MAX_RASTER_TOTAL_PIXELS} pixels. Reduce their sizes, count, or --segnavia-raster-dpi to clear this refusal.`,
    )
  return next
}

export function chargeRasterBytes(total: number, bytes: number): number {
  if (bytes > MAX_RASTER_REGION_BYTES)
    throw new RenderRefusedError(
      `The backdrop raster region has ${bytes} encoded bytes; the ceiling is ${MAX_RASTER_REGION_BYTES} bytes. Reduce its size, dpi, or effects.raster.quality to clear this refusal.`,
    )
  const next = total + bytes
  if (next > MAX_RASTER_TOTAL_BYTES)
    throw new RenderRefusedError(
      `The backdrop raster regions have ${next} total encoded bytes; the ceiling is ${MAX_RASTER_TOTAL_BYTES} bytes. Reduce their sizes, count, dpi, or effects.raster.quality to clear this refusal.`,
    )
  return next
}

async function candidates(tab: Tab, fallbackDpi: number): Promise<RasterCandidate[]> {
  const facts = await tab.locator('*').evaluateAll((elements) =>
    elements.flatMap((element, index) => {
      const style = getComputedStyle(element)
      const filter = style.getPropertyValue('backdrop-filter') || style.getPropertyValue('-webkit-backdrop-filter')
      const box = element.getBoundingClientRect()
      let opacity = 1
      let ancestor: Element | null = element
      while (ancestor && opacity > 0) {
        opacity *= Number(getComputedStyle(ancestor).opacity)
        ancestor = ancestor.parentElement
      }
      const documentWidth = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth ?? 0)
      const documentHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0)
      const visible =
        filter !== '' &&
        filter !== 'none' &&
        style.display !== 'none' &&
        style.visibility === 'visible' &&
        opacity > 0 &&
        box.width > 0 &&
        box.height > 0 &&
        box.right > 0 &&
        box.bottom > 0 &&
        box.left < documentWidth &&
        box.top < documentHeight
      if (!visible) return []
      const id = String(index)
      element.setAttribute('data-segnavia-raster-region', id)
      return [{ id, x: box.x, y: box.y, width: box.width, height: box.height, dpi: style.getPropertyValue('--segnavia-raster-dpi') }]
    }),
  )
  return facts.map((fact) => ({ ...fact, dpi: elementRasterDpi(fact.dpi, fallbackDpi) }))
}

async function captureRegion(tab: Tab, candidate: RasterCandidate, quality: number): Promise<RasterCapture> {
  const element = tab.locator(`[data-segnavia-raster-region="${candidate.id}"]`)
  await element.evaluate((found) => found.setAttribute('data-segnavia-raster-capture', ''))
  const session = await tab.context().newCDPSession(tab)
  try {
    const viewport = tab.viewportSize()
    if (!viewport) throw new RenderRefusedError('The backdrop raster tab has no viewport; render it in a sized browser page to clear this refusal.')
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: candidate.dpi / CSS_PIXELS_PER_INCH,
      mobile: false,
    })
    const { data } = await session.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality,
      captureBeyondViewport: true,
      clip: {
        x: candidate.x + (await tab.evaluate(() => scrollX)),
        y: candidate.y + (await tab.evaluate(() => scrollY)),
        width: candidate.width,
        height: candidate.height,
        scale: 1,
      },
    })
    // Embedded JPEG profiles make Adobe apply that profile to the whole PDF page;
    // profile-free sRGB samples keep color controlled by the PDF declaration.
    const bytes = stripJpegIccProfile(new Uint8Array(Buffer.from(data, 'base64')))
    const size = jpegPixelSize(bytes)
    return { bytes, width: size.width, height: size.height }
  } finally {
    await session.send('Emulation.clearDeviceMetricsOverride').catch(() => {})
    await session.detach()
    await element.evaluate((found) => found.removeAttribute('data-segnavia-raster-capture'))
  }
}

async function installCaptureStyle(tab: Tab): Promise<void> {
  await tab.addStyleTag({
    content:
      '[data-segnavia-raster-capture]{border-color:transparent!important;color:transparent!important;text-shadow:none!important}[data-segnavia-raster-capture] *{visibility:hidden!important}',
  })
}

async function replaceBackground(tab: Tab, candidate: RasterCandidate, capture: RasterCapture): Promise<void> {
  const url = `url("data:image/jpeg;base64,${Buffer.from(capture.bytes).toString('base64')}")`
  const element = tab.locator(`[data-segnavia-raster-region="${candidate.id}"]`)
  await element.evaluate((element, image) => {
    const style = (element as HTMLElement).style
    style.setProperty('backdrop-filter', 'none', 'important')
    style.setProperty('-webkit-backdrop-filter', 'none', 'important')
    // Isolation replaces the grouping backdrop-filter provided, so Chromium does
    // not wrap the page and Adobe does not mute unrelated content.
    style.setProperty('isolation', 'isolate', 'important')
    style.setProperty('background', 'none', 'important')
    style.setProperty('background-image', image, 'important')
    style.setProperty('background-size', '100% 100%', 'important')
    style.setProperty('background-position', '0 0', 'important')
    style.setProperty('background-repeat', 'no-repeat', 'important')
    style.setProperty('background-origin', 'border-box', 'important')
    style.setProperty('background-clip', 'border-box', 'important')
  }, url)
  await element.evaluate((element) => {
    const image = getComputedStyle(element).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1]
    if (!image) throw new Error('The backdrop raster background was not installed.')
    return new Promise<void>((resolve, reject) => {
      const loaded = new Image()
      loaded.onload = () => resolve()
      loaded.onerror = () => reject(new Error('Chromium could not decode the backdrop raster JPEG.'))
      loaded.src = image
    })
  })
}

export async function prepareBackdropRasters(tab: Tab, effects: RenderOptions['effects']): Promise<RasterCapture[]> {
  if (effects === false) return []
  const settings = rasterSettings(effects?.raster)
  await tab.emulateMedia({ media: 'print' })
  const regions = await candidates(tab, settings.dpi)
  if (regions.length === 0) return []
  let pixels = 0
  for (const region of regions) pixels = chargeRasterPixels(pixels, rasterPixelSize(region, region.dpi).pixels)
  await installCaptureStyle(tab)
  const captures: RasterCapture[] = []
  let bytes = 0
  for (const region of regions) {
    const capture = await captureRegion(tab, region, settings.quality)
    bytes = chargeRasterBytes(bytes, capture.bytes.length)
    captures.push(capture)
  }
  for (let index = 0; index < regions.length; index++) await replaceBackground(tab, regions[index] as RasterCandidate, captures[index] as RasterCapture)
  return captures
}

const key = (name: string): PDFName => PDFName.of(name)
const number = (object: PDFObject | undefined): number | undefined => (object instanceof PDFNumber ? object.asNumber() : undefined)
const equal = (left: Uint8Array, right: Uint8Array): boolean => left.length === right.length && left.every((value, index) => value === right[index])

export async function tagBackdropRasters(pdf: Uint8Array, captures: RasterCapture[]): Promise<Uint8Array> {
  if (captures.length === 0) return pdf
  const document = await loadPdf(pdf, { updateMetadata: false })
  const unmatched = new Set(captures)
  for (const [, object] of document.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream) || object.dict.get(key('Subtype'))?.toString() !== '/Image') continue
    for (const capture of unmatched) {
      const matches =
        object.dict.get(key('Filter'))?.toString() === '/DCTDecode' &&
        number(object.dict.get(key('Width'))) === capture.width &&
        number(object.dict.get(key('Height'))) === capture.height &&
        equal(object.contents, capture.bytes)
      if (!matches) continue
      // The captured samples are sRGB and carry no profile, so keep their PDF
      // declaration local as DeviceRGB instead of introducing a page ICC space.
      object.dict.set(key('ColorSpace'), key('DeviceRGB'))
      object.dict.set(key(GENERATED_EFFECT_IMAGE_KEY), document.context.obj(true))
      object.dict.set(key(BACKDROP_RASTER_IMAGE_KEY), document.context.obj(true))
      unmatched.delete(capture)
      break
    }
  }
  if (unmatched.size > 0)
    throw new RenderRefusedError(
      `Chromium did not embed ${unmatched.size} backdrop raster JPEG${unmatched.size === 1 ? '' : 's'} unchanged as DCTDecode images. Use a Chromium version that preserves print background JPEGs to clear this refusal.`,
    )
  return document.save()
}

export async function pdfWithBackdropRasters(tab: Tab, pdf: Parameters<Tab['pdf']>[0], effects: RenderOptions['effects']): Promise<Uint8Array> {
  const captures = await prepareBackdropRasters(tab, effects)
  return tagBackdropRasters(await tab.pdf(pdf), captures)
}
