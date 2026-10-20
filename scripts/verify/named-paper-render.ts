import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { Renderer } from '@segnavia/render'

type Check = (what: string, ok: boolean, detail?: string) => void

const pagePoints = (file: string): { width: number; height: number } | undefined => {
  const match = execFileSync('pdfinfo', [file], { encoding: 'utf8' }).match(/Page size:\s+([\d.]+) x ([\d.]+)/)
  if (!match) return undefined
  return { width: Number(match[1]), height: Number(match[2]) }
}

export async function verifyNamedPaperRender(renderer: Renderer, work: string, check: Check): Promise<void> {
  const browserPointTolerance = 1
  const papers = [
    ['postcard-4x6', 288, 432],
    ['business-card-eu', 155.91, 240.94],
  ] as const
  for (const [paper, width, height] of papers) {
    const file = path.join(work, `${paper}.pdf`)
    writeFileSync(file, await renderer.pagePdf({ html: '<p>Named paper</p>', print: { paper, orientation: 'portrait' } }))
    const actual = pagePoints(file)
    check(
      `${paper} prints at its named trim size`,
      Math.abs((actual?.width ?? 0) - width) <= browserPointTolerance && Math.abs((actual?.height ?? 0) - height) <= browserPointTolerance,
      actual ? `${actual.width} x ${actual.height} pt` : 'page size not found',
    )
  }
}
