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
      const lines = {
        control: [line('[data-keep-control]'), line('[data-keep-control-word]')],
        next: [line('[data-keep-next]'), line('[data-keep-next-word]')],
        previous: [line('[data-keep-previous]'), line('[data-keep-previous-word]')],
      }
      return { control: lines.control[0] === lines.control[1], next: lines.next[0] === lines.next[1], previous: lines.previous[0] === lines.previous[1], lines }
    })
}

export async function verifyInlineBookKeeps(frame: FrameLocator, label: string, check: Check): Promise<void> {
  const keeps = await inlineKeepReport(frame)
  check(
    `${label} inline keeps share a line with their adjacent word while the control breaks`,
    keeps.next && keeps.previous && !keeps.control,
    JSON.stringify(keeps),
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
  const pages = execFileSync('pdftotext', ['-layout', path.join(SITE, `${label}.pdf`), '-'], { encoding: 'utf8' }).split('\f')
  const pairs = label.endsWith('-he')
    ? [
        ['כותרת שמורה', 'הפסקה הבאה'],
        ['הפסקה הקודמת', 'סיום שמור'],
      ] as const
    : [
        ['KEPT BLOCK NEXT', 'NEXT BLOCK'],
        ['PREVIOUS BLOCK', 'KEPT BLOCK PREVIOUS'],
      ] as const
  const pdfKeeps = pairs.map(([held, neighbor]) => {
    const heldPage = pages.findIndex((page) => page.includes(held))
    return heldPage >= 0 && heldPage === pages.findIndex((page) => page.includes(neighbor))
  })
  check(`${label} PDF keeps each block pair on one page`, pdfKeeps.every(Boolean), JSON.stringify(pdfKeeps))
}
