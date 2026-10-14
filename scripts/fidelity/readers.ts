import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { type Browser, chromium } from 'playwright-core'
import type { ReaderResult } from './types.ts'

function ran(args: string[]): { ok: boolean; error?: string } {
  const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe' })
  return result.exitCode === 0 ? { ok: true } : { ok: false, error: result.stderr.toString().trim() || `exit ${result.exitCode}` }
}

export async function poppler(pdf: string, output: string, width: number, height: number): Promise<ReaderResult> {
  const base = output.replace(/\.png$/, '')
  const result = ran(['pdftoppm', '-png', '-singlefile', '-cropbox', '-scale-to-x', String(width), '-scale-to-y', String(height), pdf, base])
  return result.ok ? { reader: 'poppler', worked: true, image: output } : { reader: 'poppler', worked: false, error: result.error }
}

export async function coreGraphics(pdf: string, output: string, width: number, height: number): Promise<ReaderResult> {
  const result = ran(['sips', '-s', 'format', 'png', '-z', String(height), String(width), pdf, '--out', output])
  if (!result.ok) return { reader: 'coregraphics', worked: false, error: result.error }
  return (await Bun.file(output).exists())
    ? { reader: 'coregraphics', worked: true, image: output }
    : { reader: 'coregraphics', worked: false, error: 'sips exited successfully without writing a PNG.' }
}

export async function chromiumViewer(executablePath: string, pdf: string, output: string, width: number, height: number): Promise<ReaderResult> {
  const raw = output.replace(/\.png$/, '-viewer.png')
  let browser: Browser | undefined
  try {
    browser = await chromium.launch({ executablePath, ignoreDefaultArgs: ['--disable-extensions'] })
    const page = await browser.newPage({ viewport: { width, height } })
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
    const converted = ran(['ffmpeg', '-loglevel', 'error', '-i', raw, '-vf', `scale=${width}:${height}:flags=lanczos`, '-frames:v', '1', '-y', output])
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
