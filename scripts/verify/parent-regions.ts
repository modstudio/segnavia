import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DocumentInput } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'

type Check = (what: string, ok: boolean, detail?: string) => void

const margin = { blockStart: 18, blockEnd: 18, inlineStart: 20, inlineEnd: 16 }
const names = { first: 'fixture-first', left: 'fixture-left', right: 'fixture-right', blank: 'fixture-blank' }

function regions(marker: string, head = false) {
  return {
    ...(head ? { head: { edge: 'blockStart' as const, html: `<div>HOST_HEAD ${marker}</div>` } } : {}),
    side: { edge: 'inlineEnd' as const, html: `<div dir="ltr" style="font-size:7px">OUTER_${marker}</div>` },
  }
}

export function parentRegionBookFixture(hebrew: boolean): DocumentInput {
  const rules = [
    { when: { blank: true as const }, parent: names.blank },
    { when: { position: 'documentFirst' as const }, parent: names.first },
    { when: { face: 'verso' as const }, parent: names.left },
    { parent: names.right },
  ]
  return {
    type: 'document',
    kind: 'book',
    title: hebrew ? 'אזורי עמוד אב' : 'Parent regions',
    mode: 'paginated',
    settings: { lang: hebrew ? 'he' : 'en', dir: hebrew ? 'rtl' : 'ltr' },
    page: { paper: 'a5', margin },
    rectoOpenings: true,
    parentPages: [
      { type: 'parentPage', name: names.first, basedOn: 'segnavia:recto', regions: regions('FIRST', true) },
      { type: 'parentPage', name: names.left, basedOn: 'segnavia:verso', regions: regions('LEFT') },
      { type: 'parentPage', name: names.right, basedOn: 'segnavia:recto', regions: regions('RIGHT') },
      { type: 'parentPage', name: names.blank, basedOn: 'segnavia:blank', regions: regions('BLANK') },
    ],
    parentRules: rules,
    children: [
      {
        type: 'section',
        title: hebrew ? 'ראשון' : 'First',
        parentRules: rules,
        children: [{ type: 'flow', html: `<p>${'page words '.repeat(900)}</p>` }],
      },
      {
        type: 'section',
        title: hebrew ? 'שני' : 'Second',
        parentRules: rules,
        children: [{ type: 'flow', html: '<p>final page</p>' }],
      },
    ],
  }
}

export function parentRegionPrintedFixture(hebrew: boolean): DocumentInput {
  return {
    type: 'document',
    kind: 'printed',
    settings: { lang: hebrew ? 'he' : 'en', dir: hebrew ? 'rtl' : 'ltr' },
    print: { paper: 'a5' },
    parentPages: [
      { type: 'parentPage', name: names.first, geometry: { margin }, regions: regions('FIRST', true) },
      { type: 'parentPage', name: names.left, geometry: { margin }, regions: regions('LEFT') },
      { type: 'parentPage', name: names.right, geometry: { margin }, regions: regions('RIGHT') },
    ],
    parentRules: [{ when: { position: 'documentFirst' }, parent: names.first }, { when: { face: 'verso' }, parent: names.left }, { parent: names.right }],
    children: [{ type: 'page', body: { html: `<p>${'printed words '.repeat(900)}</p>` } }],
  }
}

function pageWords(file: string) {
  const xml = execFileSync('pdftotext', ['-bbox', file, '-'], { encoding: 'utf8' })
  return [...xml.matchAll(/<page width="([\d.]+)"[^>]*>([\s\S]*?)<\/page>/g)].map((page) => ({
    width: Number(page[1]),
    words: [...(page[2] ?? '').matchAll(/<word xMin="([\d.]+)"[^>]*xMax="([\d.]+)"[^>]*>([^<]+)<\/word>/g)].map((word) => ({
      x: Number(word[1]),
      xMax: Number(word[2]),
      text: word[3] ?? '',
    })),
  }))
}

export function hebrewHeadFixture(): DocumentInput {
  const left = 'hebrew-head-left'
  const right = 'hebrew-head-right'
  const head = { edge: 'blockStart' as const, html: '<div class="segnavia-running-head">כותרת</div>' }
  return {
    type: 'document',
    kind: 'book',
    title: 'כותרת חיצונית',
    mode: 'continuous',
    settings: { lang: 'he', dir: 'rtl' },
    page: { paper: 'a5', margin },
    parentPages: [
      { type: 'parentPage', name: left, basedOn: 'segnavia:verso', regions: { head } },
      { type: 'parentPage', name: right, basedOn: 'segnavia:recto', regions: { head } },
    ],
    parentRules: [{ when: { face: 'verso' }, parent: left }, { parent: right }],
    children: [
      {
        type: 'section',
        title: 'ראשון',
        parentRules: [{ when: { face: 'verso' }, parent: left }, { parent: right }],
        children: [{ type: 'flow', html: `<p>${'מילים בעמוד '.repeat(900)}</p>` }],
      },
    ],
  }
}

export async function verifyParentRegions(renderer: Renderer, work: string, check: Check): Promise<void> {
  for (const hebrew of [false, true]) {
    const label = hebrew ? 'Hebrew' : 'English'
    let id = 0
    const bytes = await renderer.bookPdf(parentRegionBookFixture(hebrew), {
      css: 'body{font:14px/20px serif}p{margin:0}',
      newId: () => `parent-region-${label}-${++id}`,
    })
    const file = path.join(work, `parent-regions-${label}.pdf`)
    writeFileSync(file, bytes)
    const pages = pageWords(file)
    const markers = pages.flatMap((page, index) =>
      page.words.filter((word) => word.text.startsWith('OUTER_')).map((word) => ({ page: index, x: word.x, width: page.width, text: word.text })),
    )
    const mirrored = markers.every((marker) => (hebrew ? marker.page % 2 === 1 : marker.page % 2 === 0) === marker.x > marker.width / 2)
    const text = pages.flatMap((page) => page.words.map((word) => word.text)).join(' ')
    check(`${label} parent regions occupy the outer edge on recto and verso`, markers.length === pages.length && mirrored, JSON.stringify(markers))
    check(
      `${label} first, left, right and blank parents carry their marker text`,
      ['FIRST', 'LEFT', 'RIGHT', 'BLANK'].every((marker) => text.includes(`OUTER_${marker}`)) && text.includes('HOST_HEAD'),
      text,
    )

    id = 0
    const printedBytes = await renderer.pagePdf(parentRegionPrintedFixture(hebrew), {
      css: 'body{font:14px/20px serif}p{margin:0}',
      newId: () => `printed-parent-region-${label}-${++id}`,
    })
    const printedFile = path.join(work, `printed-parent-regions-${label}.pdf`)
    writeFileSync(printedFile, printedBytes)
    const printedPages = pageWords(printedFile)
    const printedMarkers = printedPages.flatMap((page, index) =>
      page.words.filter((word) => word.text.startsWith('OUTER_')).map((word) => ({ page: index, x: word.x, width: page.width, text: word.text })),
    )
    const printedMirrored = printedMarkers.every((marker) => (hebrew ? marker.page % 2 === 1 : marker.page % 2 === 0) === marker.x > marker.width / 2)
    const printedText = printedPages.flatMap((page) => page.words.map((word) => word.text)).join(' ')
    check(
      `${label} printed parent regions occupy the outer edge on recto and verso`,
      printedMarkers.length === printedPages.length && printedMirrored,
      JSON.stringify(printedMarkers),
    )
    check(
      `${label} printed first, left and right parents carry their marker text and host head`,
      ['FIRST', 'LEFT', 'RIGHT'].every((marker) => printedText.includes(`OUTER_${marker}`)) && printedText.includes('HOST_HEAD'),
      printedText,
    )
  }

  let id = 0
  const hebrewHeadBytes = await renderer.bookPdf(hebrewHeadFixture(), {
    css: 'body{font:14px/20px serif}p{margin:0}',
    newId: () => `hebrew-head-${++id}`,
  })
  const hebrewHeadFile = path.join(work, 'parent-regions-Hebrew-head.pdf')
  writeFileSync(hebrewHeadFile, hebrewHeadBytes)
  const hebrewHeadPages = pageWords(hebrewHeadFile)
  const hebrewHeads = hebrewHeadPages.flatMap((page, index) =>
    page.words.filter((word) => /[כך]/.test(word.text)).map((word) => ({ page: index, x: word.x, xMax: word.xMax, width: page.width })),
  )
  const physicallyOuter = hebrewHeads.every((head) => (head.page % 2 === 0 ? head.x < head.width - head.xMax : head.width - head.xMax < head.x))
  check(
    'bare Hebrew running heads stay at the physical outer edge on left and right pages',
    hebrewHeads.length === hebrewHeadPages.length && hebrewHeads.length >= 2 && physicallyOuter,
    JSON.stringify(hebrewHeads),
  )
}
