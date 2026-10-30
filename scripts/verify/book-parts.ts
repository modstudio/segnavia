import { partBookLabels } from '../demo-book-parts-fixtures.ts'
import type { Harness } from './harness.ts'

async function partsFrame(h: Harness, id: string) {
  const element = await h.page.$(`#${id}`)
  const frame = await element?.contentFrame()
  if (!frame) throw new Error(`The parts book frame ${id} did not load.`)
  await frame.waitForFunction(
    () => document.documentElement.hasAttribute('data-segnavia-composed') || document.documentElement.hasAttribute('data-segnavia-compose-failure'),
    undefined,
    { timeout: 20_000 },
  )
  return frame
}

export async function verifyPartsBooks(h: Harness): Promise<void> {
  await h.page.goto(h.url('book-parts.html'))
  for (const hebrew of [false, true]) {
    const id = `book-parts-${hebrew ? 'he' : 'en'}`
    const frame = await partsFrame(h, id)
    const labels = partBookLabels(hebrew)
    const report = await frame.evaluate((expected) => {
      const papers = Array.from(document.querySelectorAll<HTMLElement>('[data-segnavia-book-page]'))
      const entries = Array.from(document.querySelectorAll<HTMLElement>('.segnavia-contents-entry'))
      const entry = (title: string) => entries.find((item) => item.querySelector('a')?.textContent?.trim() === title)
      const facts = (title: string) => {
        const item = entry(title)
        return {
          level: item?.getAttribute('data-level') ?? '',
          depth: item?.getAttribute('data-depth') ?? '',
          page: item?.querySelector('.segnavia-contents-page')?.textContent?.trim() ?? '',
        }
      }
      const openingPaper = document.querySelector<HTMLElement>('[data-segnavia-book-page][data-segnavia-flow="segnavia-part-1"]')
      const expectedHead = new Map([
        ['segnavia-chapter-1', expected.openingPart],
        ['segnavia-chapter-2', expected.titleOnlyPart],
        ['segnavia-chapter-3', expected.titleOnlyPart],
        ['segnavia-chapter-4', expected.appendixPart],
      ])
      const rectoHeads = papers.flatMap((paper) => {
        const page = Number(paper.getAttribute('data-segnavia-book-page'))
        const flow = paper.getAttribute('data-segnavia-flow') ?? ''
        if (page % 2 === 0 || !expectedHead.has(flow)) return []
        const head = paper.querySelector('.segnavia-running-head')?.textContent?.trim() ?? ''
        return head === '' ? [] : [{ flow, head, expected: expectedHead.get(flow) }]
      })
      const outsideRectos = papers.filter((paper) => {
        const page = Number(paper.getAttribute('data-segnavia-book-page'))
        const flow = paper.getAttribute('data-segnavia-flow') ?? ''
        return page % 2 === 1 && (flow.startsWith('segnavia-front-') || flow === 'segnavia-contents')
      })
      const firstEndIndex = papers.findIndex((paper) => paper.getAttribute('data-segnavia-flow') === 'segnavia-chapter-4')
      const firstEnd = papers[firstEndIndex]
      const previous = papers[firstEndIndex - 1]
      return {
        openingPage: Number(openingPaper?.getAttribute('data-segnavia-book-page')),
        levels: [facts(expected.openingPart), facts(expected.chapterOne), facts(`${expected.topic} 1`)],
        titleOnly: facts(expected.titleOnlyPart),
        firstChapter: facts(expected.chapterTwo),
        rectoHeads,
        outsideRectos: outsideRectos.length,
        outsideHaveNoPartHead: outsideRectos.every((paper) => !paper.querySelector('.segnavia-running-head')?.textContent?.trim()),
        endContinues:
          firstEnd?.getAttribute('data-segnavia-sequence') === 'body' &&
          previous?.getAttribute('data-segnavia-sequence') === 'body' &&
          Number(firstEnd.getAttribute('data-segnavia-number')) === Number(previous.getAttribute('data-segnavia-number')) + 1,
      }
    }, labels)
    h.check(`${id} part opening page is a recto`, report.openingPage > 0 && report.openingPage % 2 === 1, String(report.openingPage))
    h.check(
      `${id} contents nests part, chapter and h2 by level and depth`,
      JSON.stringify(report.levels) ===
        JSON.stringify([
          { level: '1', depth: '0', page: report.levels[0]?.page ?? '' },
          { level: '2', depth: '1', page: report.levels[1]?.page ?? '' },
          { level: '3', depth: '1', page: report.levels[2]?.page ?? '' },
        ]),
      JSON.stringify(report.levels),
    )
    h.check(
      `${id} title-only part contents entry targets its first chapter page`,
      report.titleOnly.page !== '' && report.titleOnly.page === report.firstChapter.page,
      `${report.titleOnly.page}/${report.firstChapter.page}`,
    )
    h.check(
      `${id} recto running heads show enclosing parts and none outside parts`,
      report.rectoHeads.length >= 3 &&
        report.rectoHeads.every((head) => head.head === head.expected) &&
        report.outsideRectos > 0 &&
        report.outsideHaveNoPartHead,
      JSON.stringify(report),
    )
    h.check(`${id} end-matter folios continue the body sequence`, report.endContinues, JSON.stringify(report))
  }
}
