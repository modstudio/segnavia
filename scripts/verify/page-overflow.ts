import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'
import { pageContentScale } from './pdf-content.ts'

function pgmPixel(file: string, x: number, y: number): number {
  const bytes = readFileSync(file)
  let offset = 0
  const token = () => {
    while ((bytes[offset] ?? 0) <= 32) offset++
    const start = offset
    while ((bytes[offset] ?? 0) > 32) offset++
    return bytes.subarray(start, offset).toString()
  }
  if (token() !== 'P5') throw new Error(`The raster at ${file} is not a raw PGM.`)
  const width = Number(token())
  token()
  if (token() !== '255') throw new Error(`The raster at ${file} is not 8-bit grayscale.`)
  while ((bytes[offset] ?? 0) <= 32) offset++
  return bytes[offset + y * width + x] ?? 255
}

export async function verifyPageOverflow(renderer: Renderer, work: string, check: (what: string, ok: boolean, detail?: string) => void): Promise<void> {
  const overflowing = await renderer.pagePdf(
    {
      html: '<style>html,body{margin:0}.overflow{position:absolute;left:360px;top:80px;width:100px;height:100px;background:black;transform:rotate(20deg)}</style><div class="overflow"></div>',
      size: { width: 400, height: 300 },
    },
    { effects: false },
  )
  const overflowScale = await pageContentScale(overflowing)
  check(
    'a fixed page with sideways overflow prints at its own scale',
    Math.abs(overflowScale - 3.125) < 0.000001,
    `cm=${overflowScale}, scale=${overflowScale * 0.24}pt/CSS px`,
  )

  const growing = await renderer.pagePdf(
    {
      html: '<style>html,body{margin:0}.bottom{position:absolute;top:1500px;left:20px;width:100px;height:100px;background:black}</style><div class="bottom"></div>',
      size: { width: 400, height: 'auto' },
    },
    { effects: false },
  )
  const growingFile = path.join(work, 'growing-absolute.pdf')
  const growingRaster = path.join(work, 'growing-absolute')
  writeFileSync(growingFile, growing)
  const growingInfo = execFileSync('pdfinfo', [growingFile], { encoding: 'utf8' })
  const growingHeight = Number(growingInfo.match(/Page size:\s+[\d.]+ x ([\d.]+) pts/)?.[1])
  execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-gray', '-r', '72', growingFile, growingRaster])
  const bottomPixel = pgmPixel(`${growingRaster}.pgm`, 50, 1160)
  check(
    'a growing page measures and paints absolutely positioned vertical content',
    Math.abs(growingHeight - 1200) < 0.01 && bottomPixel < 32,
    `height=${growingHeight}pt, bottom=${bottomPixel}`,
  )

  const repeatedFixed = await renderer.pagePdf(
    {
      html: '<style>body{margin:0}.fixed{position:fixed;top:20px;left:20px}.long{height:40in}</style><div class="fixed">FIXED_ON_EVERY_PAGE</div><div class="long"></div>',
      print: { paper: 'letter', orientation: 'portrait' },
    },
    { effects: false },
  )
  const repeatedFixedFile = path.join(work, 'repeated-fixed.pdf')
  writeFileSync(repeatedFixedFile, repeatedFixed)
  const repeatedFixedPages = Number(execFileSync('pdfinfo', [repeatedFixedFile], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/)?.[1])
  const repeatedFixedText = execFileSync('pdftotext', [repeatedFixedFile, '-'], { encoding: 'utf8' })
  const repeatedFixedCount = repeatedFixedText.match(/FIXED_ON_EVERY_PAGE/g)?.length ?? 0
  check(
    'a fixed element repeats on every page of a multi-page print',
    repeatedFixedPages >= 3 && repeatedFixedCount === repeatedFixedPages,
    `fixed=${repeatedFixedCount}, pages=${repeatedFixedPages}`,
  )
}
