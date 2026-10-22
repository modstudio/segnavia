import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Imposition, impose, MM_PER_PT } from '@segnavia/format'
import { openRenderer } from '@segnavia/render'
import { letterFoldImposition, letterFoldPages } from './demo-page-fixtures.ts'

const chromium = process.env.SEGNAVIA_CHROMIUM ?? (await import('playwright-core')).chromium.executablePath()
const output = path.join(import.meta.dirname, '../out')
mkdirSync(output, { recursive: true })
const renderer = await openRenderer({ executablePath: chromium, concurrency: 1, jsHeapMb: 128 })
try {
  const pdf = await renderer.pagesPdf(letterFoldPages, { imposition: letterFoldImposition })
  writeFileSync(path.join(output, 'pages-letter-fold.pdf'), pdf)
} finally {
  await renderer.close()
}

const letterFolded = impose(Imposition.parse(letterFoldImposition), letterFoldPages.length)
const letterXml = execFileSync('pdftotext', ['-bbox', path.join(output, 'pages-letter-fold.pdf'), '-'], { encoding: 'utf8' })
const letterPdfPages = [...letterXml.matchAll(/<page\b[^>]*>([\s\S]*?)<\/page>/g)].map((match) => match[1] ?? '')
const letterWord = (pdfPage: number, label: string) => {
  const words = [...(letterPdfPages[pdfPage] ?? '').matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)<\/word>/g)]
  const word = words.find((entry) => entry[5] === label)
  if (!word) return undefined
  return { xMin: Number(word[1]), yMin: Number(word[2]), xMax: Number(word[3]), yMax: Number(word[4]) }
}
const letterInside = (box: ReturnType<typeof letterWord>, trim: { x: number; y: number; width: number; height: number }) =>
  Boolean(
    box &&
      box.xMin >= trim.x / MM_PER_PT - 1 &&
      box.yMin >= trim.y / MM_PER_PT - 1 &&
      box.xMax <= (trim.x + trim.width) / MM_PER_PT + 1 &&
      box.yMax <= (trim.y + trim.height) / MM_PER_PT + 1,
  )
const details = [1, 2, 3, 4, 5, 6].map((label) => {
  const placement = letterFolded.placements.find((entry) => entry.page === label - 1)
  const box = placement ? letterWord(placement.side === 'front' ? 0 : 1, String(label)) : undefined
  const ok = Boolean(placement && letterInside(box, placement.trim))
  return { label, ok, side: placement?.side, column: placement?.column, trim: placement?.trim, box }
})
console.log(JSON.stringify({ pages: letterPdfPages.length, placements: letterFolded.placements.length, details }, null, 2))
if (letterPdfPages.length !== 2 || details.some((entry) => !entry.ok)) process.exit(1)
console.log('letter-fold placement check passed')
