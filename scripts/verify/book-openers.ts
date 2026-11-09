import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { DocumentInput, Plan } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { PDFDocument } from 'pdf-lib'
import { annotationDestinations, pdfOutlineItems } from './book-pdf-readback.ts'
import { compact, pagesText, pageWith } from './book-text.ts'

type Check = (what: string, ok: boolean, detail?: string) => void
const parents = { opener: 'opening', recto: 'opening-recto', verso: 'opening-verso', blank: 'opening-blank', fixed: 'opening-fixed' }
const parentRules = [
  { when: { blank: true }, parent: parents.blank },
  { when: { position: 'sectionFirst' }, parent: parents.opener },
  { when: { face: 'verso' }, parent: parents.verso },
  { parent: parents.recto },
] as const
const furniture = {
  head: '<div>HEAD[<span data-motif="segnavia:running-head"></span>]</div>',
  foot: '<div>FOLIO[<span data-motif="segnavia:folio"></span>]</div>',
}

function fixture(hebrew: boolean, opens: 'any' | 'continue'): DocumentInput {
  const titles = hebrew ? ['פרק ראשון', 'פרק שני', 'פרק שלישי', 'לוח'] : ['Chapter One', 'Chapter Two', 'Chapter Three', 'Plate']
  return {
    type: 'document',
    kind: 'book',
    metadata: { title: hebrew ? 'פותחים' : 'Openers' },
    mode: 'paginated',
    settings: { lang: hebrew ? 'he' : 'en', dir: hebrew ? 'rtl' : 'ltr' },
    page: { paper: 'a5', margin: { blockStart: 14, blockEnd: 14, inlineStart: 14, inlineEnd: 14 } },
    parentPages: Object.entries(parents).map(([role, name]) => ({
      type: 'parentPage' as const,
      name,
      basedOn: role === 'fixed' ? 'segnavia:blank' : `segnavia:${role}`,
      ...furniture,
    })),
    children: [
      { type: 'division', name: 'front', children: [{ type: 'contents', id: 'opening-contents', title: hebrew ? 'תוכן' : 'Contents' }] },
      {
        type: 'division',
        name: 'body',
        children: [
          {
            type: 'section',
            id: 'opening-one',
            title: titles[0],
            parentRules,
            children: [
              {
                type: 'flow',
                html: `<p>ONE_START</p>${`<p>${'one '.repeat(42)}</p>`.repeat(12)}<p style="break-before:page">ONE_LATER</p><p>ONE_END</p>`,
              },
            ],
          },
          {
            type: 'section',
            id: 'opening-two',
            title: titles[1],
            opens,
            children: [{ type: 'flow', html: `<h2 data-contents="exclude">TWO_HEADING</h2>${`<p>${'two '.repeat(45)}</p>`.repeat(9)}<p>TWO_END</p>` }],
          },
          {
            type: 'section',
            id: 'opening-three',
            title: titles[2],
            opens: 'any',
            parentRules,
            children: [{ type: 'flow', html: `<p>THREE_START</p>${`<p>${'three '.repeat(45)}</p>`.repeat(12)}<p>THREE_END</p>` }],
          },
          {
            type: 'section',
            id: 'opening-designed',
            title: titles[3],
            parentRules: [{ parent: parents.fixed }],
            children: [{ type: 'page', body: { html: '<p>DESIGNED_PAGE</p>' } }],
          },
        ],
      },
    ],
  }
}

async function render(renderer: Renderer, input: DocumentInput, css: string, key: string) {
  const fixtureIds = () => {
    let id = 0
    return () => `${key}-${++id}`
  }
  const plan = await renderer.bookPlan(input, { css, newId: fixtureIds() })
  const bytes = await renderer.bookPdf(input, { css, plan, newId: fixtureIds() })
  const work = mkdtempSync(path.join(tmpdir(), `segnavia-${key}-`))
  const file = path.join(work, 'book.pdf')
  writeFileSync(file, bytes)
  return { plan, document: await PDFDocument.load(bytes), pages: pagesText(file), close: () => rmSync(work, { recursive: true, force: true }) }
}

function blankDetail(plan: Plan, index: number): string {
  const page = plan.pages[index]
  return `page=${index + 1}, blank=${page?.blank}, folio=${plan.folios[index] ?? '<none>'}, face=${page?.face}, side=${page?.side}`
}

function containsText(value: string, expected: string): boolean {
  const reversed = [...expected].reverse().join('')
  return compact(value).includes(compact(expected)) || compact(value).includes(compact(reversed))
}

function containsHead(value: string, title: string): boolean {
  return value.includes('HEAD[') && containsText(value, title)
}

function containsFolio(value: string, folio: string): boolean {
  return value.includes('FOLIO[') && containsText(value, folio)
}

function planTitle(plan: Plan, page: number): string | undefined {
  const held = plan.pages[page - 1]
  return held?.variables['segnavia:section-title']
}

function rectoContinueFixture(hebrew: boolean): DocumentInput {
  const input = fixture(hebrew, 'continue')
  input.rectoOpenings = true
  input.children.splice(0, 1)
  const body = (input.children[0] as { children: Array<Record<string, unknown>> }).children
  body.splice(2)
  body[0] = {
    ...body[0],
    children: [{ type: 'flow', html: `<p>RECTO_CONTINUE_START</p>${`<p>${'first '.repeat(45)}</p>`.repeat(12)}<p>RECTO_CONTINUE_END</p>` }],
  }
  body[1] = { ...body[1], children: [{ type: 'flow', html: '<p>RECTO_CONTINUING_HEADING</p><p>RECTO_CONTINUING_END</p>' }] }
  return input
}

async function verifyContinuation(renderer: Renderer, check: Check, hebrew: boolean, css: string): Promise<void> {
  const key = hebrew ? 'hebrew' : 'english'
  const joined = await render(renderer, fixture(hebrew, 'continue'), css, `continue-${key}`)
  const separate = await render(renderer, fixture(hebrew, 'any'), css, `separate-${key}`)
  try {
    const shared = pageWith(joined.pages, 'TWO_HEADING')
    const end = pageWith(joined.pages, 'ONE_END')
    const later = pageWith(joined.pages, 'TWO_END')
    const three = pageWith(joined.pages, 'THREE_END')
    const designed = pageWith(joined.pages, 'DESIGNED_PAGE')
    const titles = hebrew ? ['פרק ראשון', 'פרק שני', 'פרק שלישי'] : ['Chapter One', 'Chapter Two', 'Chapter Three']
    const title = titles[1] ?? ''
    const outline = pdfOutlineItems(joined.document).find((item) => compact(item.title) === compact(title))
    const links = annotationDestinations(joined.document)
    const text = joined.pages[shared - 1] ?? ''
    const laterText = joined.pages[later - 1] ?? ''
    const folio = joined.plan.folios[shared - 1] ?? ''
    const contentsShowsFolio = joined.pages.some((page) => page.split('\n').some((line) => containsText(line, title) && compact(line).includes(compact(folio))))
    check(
      `${key} continue joins chapter two to chapter one's last PDF page and reduces the PDF page count`,
      shared === end && joined.document.getPageCount() < separate.document.getPageCount(),
      `chapter-one-end=${end}, chapter-two-heading=${shared}, continue-pages=${joined.document.getPageCount()}, separate-pages=${separate.document.getPageCount()}`,
    )
    const beforeShared = shared - 1
    check(
      `${key} section-title variables stay within the joined screen flow and printed PDF`,
      beforeShared > 0 &&
        planTitle(joined.plan, beforeShared) === titles[0] &&
        planTitle(joined.plan, shared) === title &&
        planTitle(joined.plan, three) === titles[2] &&
        joined.plan.pages[three - 1]?.variables['segnavia:section-title'] === undefined &&
        joined.plan.pages[designed - 1]?.variables['segnavia:section-title'] === undefined &&
        containsHead(joined.pages[beforeShared - 1] ?? '', titles[0] ?? '') &&
        containsHead(joined.pages[three - 1] ?? '', titles[2] ?? '') &&
        !containsHead(joined.pages[three - 1] ?? '', title) &&
        !containsHead(joined.pages[designed - 1] ?? '', title),
      `A-page=${beforeShared}, A-screen=${planTitle(joined.plan, beforeShared)}, shared=${shared}, shared-screen=${planTitle(joined.plan, shared)}, C-page=${three}, C-screen=${planTitle(joined.plan, three)}, C-pdf-head=${containsHead(joined.pages[three - 1] ?? '', titles[2] ?? '')}, designed-page=${designed}, designed-has-B=${containsHead(joined.pages[designed - 1] ?? '', title)}`,
    )
    check(
      `${key} continue keeps contents, outline and running-head targets on the shared PDF page`,
      outline?.page === shared &&
        links.includes(shared) &&
        contentsShowsFolio &&
        containsHead(text, title) &&
        later > shared &&
        containsHead(laterText, title) &&
        containsFolio(text, folio),
      `shared=${shared}, later=${later}, outline=${outline?.page}, links=${links.join(',')}, contents-folio=${contentsShowsFolio}, shared-head=${containsHead(text, title)}, later-head=${containsHead(laterText, title)}, compared-folio=${folio}`,
    )
  } finally {
    joined.close()
    separate.close()
  }
}

async function verifyRecto(renderer: Renderer, check: Check, hebrew: boolean, css: string): Promise<void> {
  const key = hebrew ? 'hebrew' : 'english'
  const rectoInput = fixture(hebrew, 'any')
  rectoInput.children.splice(0, 1)
  const body = (rectoInput.children[0] as { children: Array<Record<string, unknown>> }).children
  body[0] = { ...body[0], children: [{ type: 'flow', html: '<p>ODD_PAGE_SECTION</p>' }] }
  body[1] = { ...body[1], opens: 'recto', parentRules, children: [{ type: 'flow', html: '<p>RECTO_SECTION</p>' }] }
  const recto = await render(renderer, rectoInput, css, `recto-${key}`)
  try {
    const blank = recto.plan.pages.findIndex((page) => page.blank)
    const next = recto.plan.pages[blank + 1]
    const blankText = (recto.pages[blank] ?? '').trim()
    check(
      `${key} recto opener inserts an undressed blank verso before the direction's recto`,
      blank >= 0 &&
        recto.plan.folios[blank] === null &&
        compact(blankText) === 'HEAD[]FOLIO[]' &&
        next?.face === 'recto' &&
        next.side === (hebrew ? 'left' : 'right'),
      `${blankDetail(recto.plan, blank)}, blank-furniture=${JSON.stringify(compact(blankText))}, next-face=${next?.face}, next-side=${next?.side}, compared-direction=${hebrew ? 'rtl' : 'ltr'}`,
    )
  } finally {
    recto.close()
  }
}

async function verifyRectoContinuation(renderer: Renderer, check: Check, hebrew: boolean, css: string): Promise<void> {
  const key = hebrew ? 'hebrew' : 'english'
  const continuedRecto = await render(renderer, rectoContinueFixture(hebrew), css, `recto-continue-${key}`)
  try {
    const shared = pageWith(continuedRecto.pages, 'RECTO_CONTINUING_HEADING')
    const precedingEnd = pageWith(continuedRecto.pages, 'RECTO_CONTINUE_END')
    const blanksBefore = continuedRecto.plan.pages.slice(0, shared).filter((page) => page.blank).length
    check(
      `${key} recto-openings print leaves an even-page continuation unblanked`,
      shared === precedingEnd && shared % 2 === 0 && !continuedRecto.plan.pages[shared - 1]?.blank && blanksBefore === 0,
      `preceding-end=${precedingEnd}, continuing-heading=${shared}, even=${shared % 2 === 0}, shared-blank=${continuedRecto.plan.pages[shared - 1]?.blank}, blanks-through-shared=${blanksBefore}, pdf-pages=${continuedRecto.document.getPageCount()}`,
    )
  } finally {
    continuedRecto.close()
  }
}

export async function verifyBookOpeners(renderer: Renderer, check: Check): Promise<void> {
  const css = ':where(body){font:14px/20px serif}:where(p,h2){margin-block:0 3mm}'
  for (const hebrew of [false, true]) {
    await verifyContinuation(renderer, check, hebrew, css)
    await verifyRecto(renderer, check, hebrew, css)
    await verifyRectoContinuation(renderer, check, hebrew, css)
  }
}
