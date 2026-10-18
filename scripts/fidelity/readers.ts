import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { type Browser, chromium } from 'playwright-core'
import { MARKER_BORDER_COLOR, MARKER_INSET, READER_RASTER_DPI, SCALE } from './config.ts'
import type { ReaderResult } from './types.ts'

const SRGB_PROFILE = '/System/Library/ColorSync/Profiles/sRGB Profile.icc'
const PHOTOSHOP = '/Applications/Adobe Photoshop 2026/Adobe Photoshop 2026.app'
const GHOSTSCRIPT = ['/opt/homebrew/bin/gs', '/usr/local/bin/gs', '/usr/bin/gs'].find(existsSync)

function version(args: string[], fromStderr = false): string | undefined {
  let result: ReturnType<typeof Bun.spawnSync>
  try {
    result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })
  } catch {
    return undefined
  }
  if (result.exitCode !== 0) return undefined
  const value = (fromStderr ? result.stderr : result.stdout)?.toString().trim().split('\n')[0]
  return value || undefined
}

// Engine names are looked up when a reader first runs, so importing this module spawns nothing.
const engines = new Map<string, string>()
function engineName(reader: 'poppler' | 'ghostscript'): string {
  const known = engines.get(reader)
  if (known) return known
  const name =
    reader === 'poppler'
      ? (version(['pdftoppm', '-v'], true)?.replace(/^pdftoppm version /, 'Poppler ') ?? 'Poppler pdftoppm')
      : GHOSTSCRIPT
        ? `Ghostscript ${version([GHOSTSCRIPT, '--version']) ?? 'unknown version'}`
        : 'Ghostscript'
  engines.set(reader, name)
  return name
}
let adobeFailure: string | undefined

function ran(args: string[]): { ok: boolean; error?: string } {
  const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })
  return result.exitCode === 0 ? { ok: true } : { ok: false, error: result.stderr.toString().trim() || `exit ${result.exitCode}` }
}

export function imageProfile(file: string): string | undefined {
  const result = Bun.spawnSync(['sips', '-g', 'profile', file], { stdout: 'pipe', stderr: 'pipe' })
  if (result.exitCode !== 0) throw new Error(`Could not read the image profile for ${file}: ${result.stderr.toString().trim()}`)
  const profile = result.stdout
    .toString()
    .match(/^\s*profile:\s*(.+)$/m)?.[1]
    ?.trim()
  return profile && profile !== '<nil>' ? profile : undefined
}

export function validateReaderProfile(reader: ReaderResult): void {
  if (!reader.worked || !reader.image) return
  const profile = imageProfile(reader.image)
  reader.colorProfile = profile ?? 'absent'
  if (profile && !profile.toLowerCase().startsWith('srgb')) {
    throw new Error(`${reader.reader} reader image has embedded profile "${profile}"; expected sRGB or no profile.`)
  }
}

export function viewerPageBoxFromPixels(
  pixels: Uint8Array,
  screenshotWidth: number,
  screenshotHeight: number,
  pageWidth: number,
  pageHeight: number,
  markerInset = MARKER_INSET * SCALE,
): { x: number; y: number; width: number; height: number } {
  let markerLeft = screenshotWidth
  let markerTop = screenshotHeight
  let markerRight = -1
  let markerBottom = -1
  for (let y = 0; y < screenshotHeight; y++) {
    for (let x = 0; x < screenshotWidth; x++) {
      const offset = (y * screenshotWidth + x) * 3
      const distance = MARKER_BORDER_COLOR.reduce((sum, value, channel) => sum + Math.abs((pixels[offset + channel] ?? 0) - value), 0)
      if (distance > 48) continue
      markerLeft = Math.min(markerLeft, x)
      markerTop = Math.min(markerTop, y)
      markerRight = Math.max(markerRight, x)
      markerBottom = Math.max(markerBottom, y)
    }
  }
  if (markerRight < markerLeft || markerBottom < markerTop) throw new Error('Chromium PDF viewer marker was not found in the screenshot.')
  const scale = (markerLeft - screenshotWidth / 2) / (markerInset - pageWidth / 2)
  return {
    x: Math.round((screenshotWidth - pageWidth * scale) / 2),
    y: Math.round(markerTop - markerInset * scale),
    width: Math.round(pageWidth * scale),
    height: Math.round(pageHeight * scale),
  }
}

function viewerPageBox(
  file: string,
  width: number,
  height: number,
  pageWidth: number,
  pageHeight: number,
  markerInset: number,
): { x: number; y: number; width: number; height: number } {
  const decoded = Bun.spawnSync(['ffmpeg', '-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { stdout: 'pipe', stderr: 'pipe' })
  if (decoded.exitCode !== 0) throw new Error(`ffmpeg failed: ${decoded.stderr.toString().trim()}`)
  return viewerPageBoxFromPixels(decoded.stdout, width, height, pageWidth, pageHeight, markerInset)
}

export interface ReaderContext {
  executablePath: string
  markerInset: number
}

export type ReaderRender = (pdf: string, output: string, width: number, height: number, context: ReaderContext) => Promise<ReaderResult>

export async function poppler(pdf: string, output: string, width: number, height: number): Promise<ReaderResult> {
  const base = output.replace(/\.png$/, '')
  const result = ran(['pdftoppm', '-png', '-singlefile', '-cropbox', '-scale-to-x', String(width), '-scale-to-y', String(height), pdf, base])
  return result.ok
    ? { reader: 'poppler', engine: engineName('poppler'), worked: true, image: output }
    : { reader: 'poppler', engine: engineName('poppler'), worked: false, error: result.error }
}

export async function pressPoppler(
  pdf: string,
  output: string,
  width: number,
  height: number,
  profile: string,
  colorSpace: 'cmyk' | 'gray',
): Promise<ReaderResult> {
  const base = output.replace(/\.png$/, '')
  const sourceProfileFlag = colorSpace === 'cmyk' ? '-defaultcmykprofile' : '-defaultgrayprofile'
  const result = ran([
    'pdftoppm',
    '-png',
    '-singlefile',
    '-cropbox',
    '-scale-to-x',
    String(width),
    '-scale-to-y',
    String(height),
    sourceProfileFlag,
    profile,
    '-displayprofile',
    SRGB_PROFILE,
    pdf,
    base,
  ])
  return result.ok
    ? { reader: 'poppler', engine: engineName('poppler'), worked: true, image: output }
    : { reader: 'poppler', engine: engineName('poppler'), worked: false, error: result.error }
}

export const pressDisplayProfile = SRGB_PROFILE

export type PressRasterizer = 'ghostscript' | 'profiled-poppler'

export function pressRasterizer(): PressRasterizer {
  const configured = process.env.SEGNAVIA_FIDELITY_PRESS_RASTERIZER ?? 'ghostscript'
  if (configured === 'ghostscript' || configured === 'profiled-poppler') return configured
  throw new Error(`Unknown SEGNAVIA_FIDELITY_PRESS_RASTERIZER value "${configured}"; expected ghostscript or profiled-poppler.`)
}

export function pressRasterizerEngine(rasterizer: PressRasterizer): string {
  return rasterizer === 'ghostscript' ? engineName('ghostscript') : engineName('poppler')
}

export function pressGhostscriptSettings(profile: string, colorSpace: 'cmyk' | 'gray'): string[] {
  return [
    '-dUseCropBox',
    '-dPDFFitPage',
    `-sDEVICE=${colorSpace === 'cmyk' ? 'tiff32nc' : 'tiffgray'}`,
    `-sDefaultRGBProfile=${SRGB_PROFILE}`,
    `-sBlendColorProfile=${profile}`,
    '-dUsePDFX3Profile',
    '-dRenderIntent=1',
    '-dBlackPtComp=1',
    '-dImageIntent=1',
    '-dImageBlackPt=1',
    '-dVectorIntent=1',
    '-dVectorBlackPt=1',
    '-dTextIntent=1',
    '-dTextBlackPt=1',
    '-sCompression=none',
  ]
}

export async function pressGhostscript(
  pdf: string,
  output: string,
  width: number,
  height: number,
  profile: string,
  colorSpace: 'cmyk' | 'gray',
): Promise<ReaderResult> {
  if (!GHOSTSCRIPT) {
    return { reader: 'ghostscript', engine: engineName('ghostscript'), worked: false, error: 'gs was not found in a standard Homebrew or system location.' }
  }
  const result = ran([
    GHOSTSCRIPT,
    '-dSAFER',
    '-dBATCH',
    '-dNOPAUSE',
    ...pressGhostscriptSettings(profile, colorSpace),
    `-r${READER_RASTER_DPI}`,
    `-g${width}x${height}`,
    '-dTextAlphaBits=4',
    '-dGraphicsAlphaBits=4',
    `-sOutputFile=${output}`,
    pdf,
  ])
  return result.ok
    ? { reader: 'ghostscript', engine: engineName('ghostscript'), worked: true, image: output }
    : { reader: 'ghostscript', engine: engineName('ghostscript'), worked: false, error: result.error }
}

export async function coreGraphics(pdf: string, output: string, width: number, height: number): Promise<ReaderResult> {
  const result = ran(['sips', '-s', 'format', 'png', '-z', String(height), String(width), pdf, '--out', output])
  if (!result.ok) return { reader: 'coregraphics', engine: 'CoreGraphics via sips', worked: false, error: result.error }
  if (!(await Bun.file(output).exists())) {
    return { reader: 'coregraphics', engine: 'CoreGraphics via sips', worked: false, error: 'sips exited successfully without writing a PNG.' }
  }
  const converted = `${output}.srgb.png`
  const matched = ran(['sips', '-m', SRGB_PROFILE, output, '--out', converted])
  if (!matched.ok) return { reader: 'coregraphics', engine: 'CoreGraphics via sips', worked: false, error: matched.error }
  await rename(converted, output)
  return { reader: 'coregraphics', engine: 'CoreGraphics via sips', worked: true, image: output }
}

export async function chromiumViewer(
  executablePath: string,
  pdf: string,
  output: string,
  width: number,
  height: number,
  markerInset = MARKER_INSET * SCALE,
): Promise<ReaderResult> {
  const raw = output.replace(/\.png$/, '-viewer.png')
  let browser: Browser | undefined
  try {
    browser = await chromium.launch({ executablePath, ignoreDefaultArgs: ['--disable-extensions'] })
    const captureWidth = width
    const captureHeight = height
    const page = await browser.newPage({ viewport: { width: captureWidth, height: captureHeight } })
    await page.goto(`${pathToFileURL(pdf).href}#toolbar=0&view=Fit`)
    await page.waitForTimeout(1800)
    await page
      .evaluate(() => {
        const viewer = document.querySelector('pdf-viewer') as HTMLElement & { shadowRoot: ShadowRoot }
        const toolbar = viewer?.shadowRoot?.querySelector('#toolbar') as HTMLElement | null
        if (toolbar) toolbar.style.display = 'none'
        document.documentElement.style.background = 'white'
      })
      .catch(() => {})
    await page.screenshot({ path: raw })
    const box = viewerPageBox(raw, captureWidth, captureHeight, width, height, markerInset)
    const converted = ran([
      'ffmpeg',
      '-loglevel',
      'error',
      '-i',
      raw,
      '-vf',
      `crop=${box.width}:${box.height}:${box.x}:${box.y},scale=${width}:${height}:flags=lanczos`,
      '-frames:v',
      '1',
      '-y',
      output,
    ])
    if (!converted.ok) return { reader: 'chromium', engine: 'Chromium PDF viewer', worked: false, error: converted.error }
    return { reader: 'chromium', engine: 'Chromium PDF viewer', worked: true, image: output }
  } catch (error) {
    return { reader: 'chromium', engine: 'Chromium PDF viewer', worked: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    await browser?.close().catch(() => {})
    if (await Bun.file(raw).exists()) await unlink(raw)
  }
}

function scriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export async function adobePdfEngine(pdf: string, output: string, width: number, height: number): Promise<ReaderResult> {
  const engine = 'Adobe PDF engine via Photoshop 2026'
  if (!existsSync(PHOTOSHOP)) return { reader: 'adobe', engine, worked: false, error: `Photoshop is not installed at ${PHOTOSHOP}.` }
  if (adobeFailure) return { reader: 'adobe', engine, worked: false, error: adobeFailure }
  const script = `${output}.jsx`
  const jsx = `app.displayDialogs = DialogModes.NO;
var options = new PDFOpenOptions();
options.antiAlias = true;
options.cropPage = CropToType.CROPBOX;
options.mode = OpenDocumentMode.RGB;
options.page = 1;
options.resolution = ${READER_RASTER_DPI};
options.suppressWarnings = true;
var document = app.open(File('${scriptString(pdf)}'), options);
document.resizeImage(UnitValue(${width}, 'px'), UnitValue(${height}, 'px'), null, ResampleMethod.BICUBICSHARPER);
document.convertProfile('sRGB IEC61966-2.1', Intent.RELATIVECOLORIMETRIC, true, true);
var png = new PNGSaveOptions();
png.interlaced = false;
document.saveAs(File('${scriptString(output)}'), png, true, Extension.LOWERCASE);
document.close(SaveOptions.DONOTSAVECHANGES);`
  await Bun.write(script, jsx)
  try {
    execFileSync('osascript', ['-e', `tell application "Adobe Photoshop 2026" to do javascript file ${JSON.stringify(script)}`], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 120_000,
    })
    if (!(await Bun.file(output).exists())) return { reader: 'adobe', engine, worked: false, error: 'Photoshop exited successfully without writing a PNG.' }
    return { reader: 'adobe', engine, worked: true, image: output }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    adobeFailure = detail.includes('ETIMEDOUT')
      ? `Photoshop ExtendScript timed out after 120 seconds. This session must be allowed to control Photoshop through osascript (System Settings → Privacy & Security → Automation). Check with: osascript -e 'tell application "Adobe Photoshop 2026" to do javascript "1+1"' (it must print 2).`
      : `Photoshop ExtendScript failed: ${detail}`
    return { reader: 'adobe', engine, worked: false, error: adobeFailure }
  } finally {
    await unlink(script).catch(() => {})
  }
}

export async function ghostscript(pdf: string, output: string, width: number, height: number): Promise<ReaderResult> {
  if (!GHOSTSCRIPT) {
    return { reader: 'ghostscript', engine: engineName('ghostscript'), worked: false, error: 'gs was not found in a standard Homebrew or system location.' }
  }
  const result = ran([
    GHOSTSCRIPT,
    '-dSAFER',
    '-dBATCH',
    '-dNOPAUSE',
    '-dUseCropBox',
    '-dPDFFitPage',
    '-sDEVICE=png16m',
    `-r${READER_RASTER_DPI}`,
    `-g${width}x${height}`,
    '-dTextAlphaBits=4',
    '-dGraphicsAlphaBits=4',
    `-sOutputFile=${output}`,
    pdf,
  ])
  return result.ok
    ? { reader: 'ghostscript', engine: engineName('ghostscript'), worked: true, image: output }
    : { reader: 'ghostscript', engine: engineName('ghostscript'), worked: false, error: result.error }
}

export function readerPath(directory: string, reader: string): string {
  return path.join(directory, `${reader}.png`)
}

export const READERS: readonly { id: string; render: ReaderRender }[] = [
  { id: 'poppler', render: (pdf, output, width, height) => poppler(pdf, output, width, height) },
  { id: 'coregraphics', render: (pdf, output, width, height) => coreGraphics(pdf, output, width, height) },
  {
    id: 'chromium',
    render: (pdf, output, width, height, context) => chromiumViewer(context.executablePath, pdf, output, width, height, context.markerInset),
  },
  { id: 'adobe', render: (pdf, output, width, height) => adobePdfEngine(pdf, output, width, height) },
  { id: 'ghostscript', render: (pdf, output, width, height) => ghostscript(pdf, output, width, height) },
]
