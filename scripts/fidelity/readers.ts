import { rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { type Browser, chromium } from 'playwright-core'
import type { ReaderResult } from './types.ts'

const SRGB_PROFILE = '/System/Library/ColorSync/Profiles/sRGB Profile.icc'

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

function viewerPageBox(file: string, width: number, height: number, aspect: number): { x: number; y: number; width: number; height: number } {
  const decoded = Bun.spawnSync(['ffmpeg', '-loglevel', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { stdout: 'pipe', stderr: 'pipe' })
  if (decoded.exitCode !== 0) throw new Error(`ffmpeg failed: ${decoded.stderr.toString().trim()}`)
  const pixels = decoded.stdout
  const background = [pixels[0] ?? 0, pixels[1] ?? 0, pixels[2] ?? 0]
  let left = width
  let top = height
  let right = 0
  let bottom = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3
      const distance = [0, 1, 2].reduce((sum, channel) => sum + Math.abs((pixels[offset + channel] ?? 0) - (background[channel] ?? 0)), 0)
      if (distance <= 24) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  let pageWidth = right - left + 1
  let pageHeight = bottom - top + 1
  if (pageWidth / pageHeight > aspect) {
    const fitted = pageHeight * aspect
    left += (pageWidth - fitted) / 2
    pageWidth = fitted
  } else {
    const fitted = pageWidth / aspect
    top += (pageHeight - fitted) / 2
    pageHeight = fitted
  }
  return { x: Math.round(left), y: Math.round(top), width: Math.round(pageWidth), height: Math.round(pageHeight) }
}

export async function poppler(pdf: string, output: string, width: number, height: number): Promise<ReaderResult> {
  const base = output.replace(/\.png$/, '')
  const result = ran(['pdftoppm', '-png', '-singlefile', '-cropbox', '-scale-to-x', String(width), '-scale-to-y', String(height), pdf, base])
  return result.ok ? { reader: 'poppler', worked: true, image: output } : { reader: 'poppler', worked: false, error: result.error }
}

export async function coreGraphics(pdf: string, output: string, width: number, height: number): Promise<ReaderResult> {
  const result = ran(['sips', '-s', 'format', 'png', '-z', String(height), String(width), pdf, '--out', output])
  if (!result.ok) return { reader: 'coregraphics', worked: false, error: result.error }
  if (!(await Bun.file(output).exists())) return { reader: 'coregraphics', worked: false, error: 'sips exited successfully without writing a PNG.' }
  const converted = `${output}.srgb.png`
  const matched = ran(['sips', '-m', SRGB_PROFILE, output, '--out', converted])
  if (!matched.ok) return { reader: 'coregraphics', worked: false, error: matched.error }
  await rename(converted, output)
  return { reader: 'coregraphics', worked: true, image: output }
}

export async function chromiumViewer(executablePath: string, pdf: string, output: string, width: number, height: number): Promise<ReaderResult> {
  const raw = output.replace(/\.png$/, '-viewer.png')
  let browser: Browser | undefined
  try {
    browser = await chromium.launch({ executablePath, ignoreDefaultArgs: ['--disable-extensions'] })
    const captureWidth = Math.min(width, 1800)
    const captureHeight = Math.round((captureWidth * height) / width)
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
    const box = viewerPageBox(raw, captureWidth, captureHeight, width / height)
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
    if (!converted.ok) return { reader: 'chromium', worked: false, error: converted.error }
    return { reader: 'chromium', worked: true, image: output }
  } catch (error) {
    return { reader: 'chromium', worked: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    await browser?.close().catch(() => {})
    if (await Bun.file(raw).exists()) await unlink(raw)
  }
}

export function readerPath(directory: string, reader: string): string {
  return path.join(directory, `${reader}.png`)
}
