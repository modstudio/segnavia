import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DocumentInput } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { AS_OF_DEMO_DATE, AS_OF_DEMO_MOMENT, PAGE_DEMO_PAGES } from '../build-page-demo.ts'

export async function verifyPageAsOfRender(renderer: Renderer, work: string, check: (what: string, ok: boolean, detail?: string) => void): Promise<void> {
  const days: Array<{ date: string }> = []
  const fixture = PAGE_DEMO_PAGES.find(({ id }) => id === 'as-of')?.fixture as DocumentInput
  const pdf = await renderer.pagePdf(fixture, {
    moment: AS_OF_DEMO_MOMENT,
    asOf: { report: (reported) => days.push(...reported) },
  })
  const file = path.join(work, 'as-of.pdf')
  writeFileSync(file, pdf)
  const text = execFileSync('pdftotext', [file, '-'], { encoding: 'utf8' })
  check(
    'page render binds and reports its deterministic as-of day',
    text.includes(AS_OF_DEMO_DATE) && days[0]?.date === AS_OF_DEMO_DATE,
    `${days[0]?.date} ${text.trim()}`,
  )
}
