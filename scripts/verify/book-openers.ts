import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { DocumentInput, Plan } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { PDFDocument } from 'pdf-lib'
import { annotationDestinations, pdfOutlineItems } from './book-pdf-readback.ts'
import { compact, pagesText, pageWith } from './book-text.ts'

type Check = (what: string, ok: boolean, detail?: string) => void
const parents = { opener: 'opening', recto: 'opening-recto', verso: 'opening-verso', blank: 'opening-blank' }
const furniture = {
  head: '<div>HEAD[<span data-motif="segnavia:running-head"></span>]</div>',
  foot: '<div>FOLIO[<span data-motif="segnavia:folio"></span>]</div>',
}

function fixture(hebrew: boolean, opens: 'any' | 'continue'): DocumentInput {
  const titles = hebrew ? ['פרק ראשון', 'פרק שני'] : ['Chapter One', 'Chapter Two']
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
      basedOn: `segnavia:${role}`,
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
            parents,
            children: [{ type: 'flow', html: `<p>ONE_START</p>${`<p>${'one '.repeat(42)}</p>`.repeat(7)}<p>ONE_END</p>` }],
          },
          {
            type: 'section',
            id: 'opening-two',
            title: titles[1],
            opens,
            children: [{ type: 'flow', html: `<h2>TWO_HEADING</h2><p>${'two '.repeat(45)}</p>` }],
          },
        ],
      },
    ],
  }
}

async function render(renderer: Renderer, input: DocumentInput, css: string, key: string) {
  const plan = await renderer.bookPlan(input, { css })
  const bytes = await renderer.bookPdf(input, { css, plan })
  const work = mkdtempSync(path.join(tmpdir(), `segnavia-${key}-`))
  const file = path.join(work, 'book.pdf')
  writeFileSync(file, bytes)
  return { plan, document: await PDFDocument.load(bytes), pages: pagesText(file), close: () => rmSync(work, { recursive: true, force: true }) }
}

function blankDetail(plan: Plan, index: number): string {
  const page = plan.pages[index]
  return `page=${index + 1}, blank=${page?.blank}, folio=${plan.folios[index] ?? '<none>'}, face=${page?.face}, side=${page?.side}`
}

export async function verifyBookOpeners(renderer: Renderer, check: Check): Promise<void> {
  const css = ':where(body){font:14px/20px serif}:where(p,h2){margin-block:0 3mm}'
  for (const hebrew of [false, true]) {
    const key = hebrew ? 'hebrew' : 'english'
    const joined = await render(renderer, fixture(hebrew, 'continue'), css, `continue-${key}`)
    const separate = await render(renderer, fixture(hebrew, 'any'), css, `separate-${key}`)
    try {
      const shared = pageWith(joined.pages, 'TWO_HEADING')
      const end = pageWith(joined.pages, 'ONE_END')
      const title = hebrew ? 'פרק שני' : 'Chapter Two'
      const outline = pdfOutlineItems(joined.document).find((item) => compact(item.title) === compact(title))
      const links = annotationDestinations(joined.document)
      const text = joined.pages[shared - 1] ?? ''
      check(
        `${key} continue joins chapter two to chapter one's last PDF page and reduces the PDF page count`,
        shared === end && joined.document.getPageCount() < separate.document.getPageCount(),
        `chapter-one-end=${end}, chapter-two-heading=${shared}, continue-pages=${joined.document.getPageCount()}, separate-pages=${separate.document.getPageCount()}`,
      )
      check(
        `${key} continue keeps contents, outline and running-head targets on the shared PDF page`,
        outline?.page === shared && links.includes(shared) && text.includes(`HEAD[${title}]`) && text.includes(`FOLIO[${joined.plan.folios[shared - 1]}]`),
        `shared=${shared}, outline=${outline?.page}, links=${links.join(',')}, compared-head=${title}, compared-folio=${joined.plan.folios[shared - 1]}`,
      )
    } finally {
      joined.close()
      separate.close()
    }

    const rectoInput = fixture(hebrew, 'any')
    const body = (rectoInput.children[1] as { children: Array<Record<string, unknown>> }).children
    body[0] = { ...body[0], children: [{ type: 'flow', html: '<p>ODD_PAGE_SECTION</p>' }] }
    body[1] = { ...body[1], opens: 'recto', parents, children: [{ type: 'flow', html: '<p>RECTO_SECTION</p>' }] }
    const recto = await render(renderer, rectoInput, css, `recto-${key}`)
    try {
      const blank = recto.plan.pages.findIndex((page) => page.blank)
      const next = recto.plan.pages[blank + 1]
      check(
        `${key} recto opener inserts an undressed blank verso before the direction's recto`,
        blank >= 0 &&
          recto.plan.folios[blank] === null &&
          (recto.pages[blank] ?? '').trim() === '' &&
          next?.face === 'recto' &&
          next.side === (hebrew ? 'left' : 'right'),
        `${blankDetail(recto.plan, blank)}, next-face=${next?.face}, next-side=${next?.side}, compared-direction=${hebrew ? 'rtl' : 'ltr'}`,
      )
    } finally {
      recto.close()
    }
  }
}
