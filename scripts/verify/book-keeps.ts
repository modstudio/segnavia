import { execFileSync } from 'node:child_process'
import path from 'node:path'
import type { Frame, FrameLocator } from 'playwright-core'
import { SITE } from './harness.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

export const BOOK_BRIDGE_MESSAGES = new Set([
  'segnavia:key',
  'segnavia:height',
  'segnavia:ready',
  'segnavia:animation',
  'segnavia:slot-fit',
  'segnavia:book-place',
  'segnavia:compose-failure',
])

async function inlineKeepReport(frame: FrameLocator) {
  return frame
    .locator('[data-keep-probes]')
    .last()
    .evaluate((root) => {
      const line = (selector: string) => {
        const element = root.querySelector(selector)
        if (!element) return undefined
        const range = document.createRange()
        range.selectNodeContents(element)
        return range.getClientRects()[0]?.top
      }
      const elementLine = (selector: string) => root.querySelector(selector)?.getBoundingClientRect().top
      const wordLine = (selector: string) => {
        const row = root.querySelector(selector)
        const word = row?.getAttribute('data-word')
        if (!row || !word) return undefined
        const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const start = node.nodeValue?.indexOf(word) ?? -1
          if (start < 0) continue
          const range = document.createRange()
          range.setStart(node, start)
          range.setEnd(node, start + word.length)
          return range.getClientRects()[0]?.top
        }
        return undefined
      }
      const lines = {
        control: [line('[data-keep-control]'), wordLine('[data-keep-control-row]')],
        next: [line('[data-keep-next]'), wordLine('[data-keep-next-row]')],
        previous: [line('[data-keep-previous]'), wordLine('[data-keep-previous-row]')],
        image: [elementLine('[data-keep-image]'), wordLine('[data-keep-image-row]')],
        neighborImage: [line('[data-keep-before-image]'), elementLine('[data-keep-neighbor-image]')],
      }
      const sharesLine = (pair: Array<number | undefined>) => pair[0] !== undefined && pair[1] !== undefined && Math.abs(pair[0] - pair[1]) < 16
      return {
        control: lines.control[0] === lines.control[1],
        next: lines.next[0] === lines.next[1],
        previous: lines.previous[0] === lines.previous[1],
        image: sharesLine(lines.image),
        neighborImage: sharesLine(lines.neighborImage),
        lines,
      }
    })
}

export async function verifyInlineBookKeeps(frame: FrameLocator, label: string, check: Check): Promise<void> {
  const keeps = await inlineKeepReport(frame)
  check(
    `${label} inline keeps share a line with their adjacent word while the control breaks`,
    keeps.next && keeps.previous && keeps.image && keeps.neighborImage && !keeps.control,
    JSON.stringify(keeps),
  )
}

export function verifyBookKeepPdf(pdfPath: string, language: 'en' | 'he', check: Check): void {
  const label = path.basename(pdfPath, '.pdf')
  const pages = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' }).split('\f')
  const pairs =
    language === 'he'
      ? ([
          ['כותרת שמורה', 'הפסקה הבאה'],
          ['הפסקה הקודמת', 'סיום שמור'],
        ] as const)
      : ([
          ['KEPT BLOCK NEXT', 'NEXT BLOCK'],
          ['PREVIOUS BLOCK', 'KEPT BLOCK PREVIOUS'],
        ] as const)
  const pdfKeeps = pairs.map(([held, neighbor]) => {
    const heldPage = pages.findIndex((page) => page.includes(held))
    return heldPage >= 0 && heldPage === pages.findIndex((page) => page.includes(neighbor))
  })
  check(`${label} PDF keeps each block pair on one page`, pdfKeeps.every(Boolean), JSON.stringify(pdfKeeps))
}

export function verifyContinuousBookKeepPdf(pdfPath: string, language: 'en' | 'he', check: Check): void {
  verifyBookKeepPdf(pdfPath, language, check)
  const label = path.basename(pdfPath, '.pdf')
  const lines = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' })
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split('\n')
    .filter((line) => line.trim())
  const rows: string[][] = []
  for (const line of lines) {
    if (line.includes('xxx')) rows.push([line])
    else rows.at(-1)?.push(line)
  }
  const [control = [], next = [], previous = [], image = []] = rows
  const hasWord = (line: string) => (language === 'he' ? /[\u0590-\u05ff].*[\u0590-\u05ff]/.test(line) : line.includes('WORD'))
  const sharesLine = (row: string[], mark: string) => row.some((line) => line.includes(mark) && hasWord(line))
  const wordLine = (row: string[]) => row.find(hasWord) ?? ''
  const wordIndent = (row: string[]) => {
    const line = wordLine(row)
    return line.length - line.trimStart().length
  }
  const report = {
    control: control.some((line) => line.includes('§')) && !sharesLine(control, '§'),
    next: sharesLine(next, '§'),
    previous: sharesLine(previous, '¶'),
    image: wordIndent(image) !== wordIndent(control) || wordLine(image).includes('\u2060'),
    rows: rows.slice(0, 4).map((row) => row.map((line) => ({ indent: line.length - line.trimStart().length, text: line.trim() }))),
  }
  check(
    `${label} PDF inline keeps share a line with their adjacent word while the control breaks`,
    report.control && report.next && report.previous && report.image,
    JSON.stringify(report),
  )
}

export async function verifyPaginatedBookKeeps(locator: FrameLocator, frame: Frame, label: string, check: Check): Promise<void> {
  await verifyInlineBookKeeps(locator, `${label} paginated`, check)
  const keeps = await frame.evaluate(() => {
    const page = (selector: string) => document.querySelector(`[data-segnavia-book-page] ${selector}`)?.closest('[data-segnavia-book-page]')
    return {
      next: page('[data-keep-block-next]') === page('[data-keep-block-next-neighbor]'),
      previous: page('[data-keep-block-previous]') === page('[data-keep-block-previous-neighbor]'),
    }
  })
  check(`${label} block keeps share a page with their adjacent block`, keeps.next && keeps.previous, JSON.stringify(keeps))
  const language = label.endsWith('-he') ? 'he' : 'en'
  verifyBookKeepPdf(path.join(SITE, `${label}.pdf`), language, check)
  verifyContinuousBookKeepPdf(path.join(SITE, `book-keeps-continuous-${language}.pdf`), language, check)
}
