import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { type DocumentInput, formatNumber, type Plan } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { PDFDocument } from 'pdf-lib'
import { pdfOutlineItems, pdfPageLabels } from './book-pdf-readback.ts'
import { compact, pagesText } from './book-text.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const sectionParents = { opener: 'folio-opener', recto: 'folio-recto', verso: 'folio-verso', blank: 'folio-blank' }
const uncountedFlows = new Set(['numbering-cover', 'numbering-inside-cover'])

const fixtureIds = () => {
  let id = 0
  return () => `section-numbering-fixture-${++id}`
}

function longChapter(marker: string): string {
  return `<p>${marker}</p>${Array.from({ length: 18 }, (_, index) => `<p>${marker}-${index} ${'A composed paragraph fills the numbered chapter. '.repeat(12)}</p>`).join('')}`
}

function fixture(): DocumentInput {
  const foot = '<div class="numbering-folio">FOLIO[<span data-motif="segnavia:folio"></span>]</div>'
  const parentPages = (['opener', 'recto', 'verso', 'blank'] as const).map((role) => ({
    type: 'parentPage' as const,
    name: `folio-${role}`,
    basedOn: `segnavia:${role}`,
    foot,
  }))
  return {
    type: 'document',
    kind: 'book',
    metadata: { title: 'Section numbering verification' },
    mode: 'paginated',
    settings: { lang: 'en' },
    page: { paper: 'a5', margin: { blockStart: 14, blockEnd: 16, inlineStart: 16, inlineEnd: 14 } },
    parentPages,
    children: [
      {
        type: 'division',
        name: 'front',
        children: [
          {
            type: 'section',
            id: 'numbering-cover',
            contents: false,
            parents: sectionParents,
            numbering: { counted: false },
            children: [{ type: 'flow', html: '<p>COVER-PAGE</p>' }],
          },
          {
            type: 'section',
            id: 'numbering-inside-cover',
            contents: false,
            parents: sectionParents,
            numbering: { counted: false },
            children: [{ type: 'flow', html: '<p>INSIDE-COVER-PAGE</p>' }],
          },
          { type: 'contents', id: 'numbering-contents', title: 'Contents', parents: sectionParents },
          {
            type: 'section',
            id: 'numbering-preface',
            title: 'Preface',
            parents: sectionParents,
            children: [{ type: 'flow', html: `<p>PREFACE-PAGE ${'Short preface text. '.repeat(12)}</p>` }],
          },
        ],
      },
      {
        type: 'division',
        name: 'body',
        children: [
          {
            type: 'section',
            id: 'numbering-chapter-one',
            title: 'Chapter One',
            parents: sectionParents,
            children: [{ type: 'flow', html: longChapter('CHAPTER-ONE') }],
          },
          {
            type: 'section',
            id: 'numbering-chapter-two',
            title: 'Chapter Two',
            parents: sectionParents,
            children: [{ type: 'flow', html: longChapter('CHAPTER-TWO') }],
          },
          {
            type: 'section',
            id: 'numbering-chapter-three',
            title: 'Chapter Three',
            parents: sectionParents,
            numbering: { restart: 50 },
            children: [{ type: 'flow', html: longChapter('CHAPTER-THREE') }],
          },
        ],
      },
    ],
  }
}

function expectedFolios(plan: Plan): Array<string | null> {
  const next = { front: 0, body: 0 }
  let thirdStarted = false
  return plan.pages.map((page) => {
    if (uncountedFlows.has(page.flow)) return null
    if (page.flow === 'numbering-chapter-three' && !page.blank && !thirdStarted) {
      next.body = 49
      thirdStarted = true
    }
    next[page.sequence] += 1
    if (page.blank) return null
    return formatNumber(next[page.sequence], page.sequence === 'front' ? 'roman-lower' : 'arabic')
  })
}

function firstPage(plan: Plan, predicate: (page: Plan['pages'][number]) => boolean): number {
  return plan.pages.findIndex(predicate)
}

function footerFolios(pages: string[]): Array<string | undefined> {
  return pages.map((page) => compact(page).match(/FOLIO\[([^\]]*)\]/)?.[1])
}

function contentsNumberMismatches(plan: Plan, pages: string[], labels: string[], document: PDFDocument): string[] {
  const contentsText = plan.pages
    .map((page, index) => (page.flow === 'numbering-contents' ? pages[index] : undefined))
    .filter((page): page is string => page !== undefined)
    .join('\n')
  const lines = contentsText.split('\n').map(compact)
  return pdfOutlineItems(document).flatMap((item) => {
    const label = labels[item.page - 1] ?? ''
    const title = compact(item.title)
    return lines.some((line) => line.includes(title) && line.endsWith(compact(label))) ? [] : [`${item.title}:contents!=page${item.page}:${label}`]
  })
}

export async function verifySectionNumbering(renderer: Renderer, check: Check): Promise<void> {
  const input = fixture()
  const css = ':where(body){font:13px/19px serif}:where(p){margin-block:0 3mm}:where(.numbering-folio){font:9px serif}'
  const plan = await renderer.bookPlan(input, { css, newId: fixtureIds() })
  const bytes = await renderer.bookPdf(input, { css, plan, newId: fixtureIds() })
  const document = await PDFDocument.load(bytes)
  const work = mkdtempSync(path.join(tmpdir(), 'segnavia-section-numbering-'))
  const file = path.join(work, 'book.pdf')
  try {
    writeFileSync(file, bytes)
    const pages = pagesText(file)
    const labels = pdfPageLabels(document)
    check(
      'section-numbering PDF page count matches its composed plan',
      document.getPageCount() === plan.pages.length && pages.length === plan.pages.length,
      `pdf-lib=${document.getPageCount()}, text-pages=${pages.length}, plan=${plan.pages.length}`,
    )
    const labelMismatches = labels.flatMap((label, index) =>
      label === (plan.folios[index] ?? '') ? [] : [`${index + 1}:${label}!=${plan.folios[index] ?? ''}`],
    )
    check('section-numbering PDF labels match every plan folio', labelMismatches.length === 0, `mismatches=${labelMismatches.join(',') || 'none'}`)

    const coverPages = plan.pages.flatMap((page, index) => (page.flow === 'numbering-cover' ? [index] : []))
    const insidePages = plan.pages.flatMap((page, index) => (page.flow === 'numbering-inside-cover' ? [index] : []))
    const contents = firstPage(plan, (page) => page.flow === 'numbering-contents')
    const body = firstPage(plan, (page) => page.sequence === 'body')
    const third = firstPage(plan, (page) => page.flow === 'numbering-chapter-three' && !page.blank)
    const landmarksOk =
      coverPages.length > 0 &&
      insidePages.length > 0 &&
      coverPages.every((index) => labels[index] === '') &&
      insidePages.every((index) => labels[index] === '') &&
      labels[contents] === 'i' &&
      labels[body] === '1' &&
      labels[third] === '50'
    check(
      'section-numbering cover, inside cover, contents, body and restart labels match their declared landmarks',
      landmarksOk,
      `cover=${coverPages.map((index) => labels[index]).join('|')}, inside=${insidePages.map((index) => labels[index]).join('|')}, contents=${labels[contents]}, body=${labels[body]}, chapter-three=${labels[third]}`,
    )

    const expected = expectedFolios(plan)
    const sequenceMismatches = plan.folios.flatMap((folio, index) =>
      folio === expected[index] ? [] : [`${index + 1}:${folio ?? ''}!=${expected[index] ?? ''}`],
    )
    check(
      'section-numbering plan folios neither repeat nor skip within each division and restarted sequence',
      sequenceMismatches.length === 0,
      `mismatches=${sequenceMismatches.join(',') || 'none'}`,
    )

    const chapterLengths = ['numbering-chapter-one', 'numbering-chapter-two', 'numbering-chapter-three'].map(
      (flow) => `${flow}=${plan.pages.filter((page) => page.flow === flow).length}`,
    )
    check(
      'section-numbering fixture gives every body chapter at least two composed pages',
      chapterLengths.every((entry) => Number(entry.split('=')[1]) >= 2),
      `page-counts=${chapterLengths.join(',')}`,
    )

    const feet = footerFolios(pages)
    const footMismatches = labels.flatMap((label, index) => (feet[index] === label ? [] : [`${index + 1}:${feet[index] ?? '<missing>'}!=${label}`]))
    check(
      'section-numbering running-foot folios match every PDF page label and omit uncounted folios',
      footMismatches.length === 0,
      `mismatches=${footMismatches.join(',') || 'none'}`,
    )

    const contentsMismatches = contentsNumberMismatches(plan, pages, labels, document)
    check(
      'section-numbering contents numbers match the labels at every PDF outline destination',
      contentsMismatches.length === 0,
      `mismatches=${contentsMismatches.join(',') || 'none'}`,
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}
