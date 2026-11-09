import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { type DocumentInput, type FontFailure, type FontSource, HEBREW_UNICODE_RANGE } from '@segnavia/format'
import type { Renderer } from '@segnavia/render'
import { BIDI_CONTROLS, fontRows } from './hebrew-text.ts'

type Check = (what: string, ok: boolean, detail?: string) => void

const FACE = path.resolve(import.meta.dirname, '../../fixtures/hebrew-notice/NotoSerifHebrew-Regular.ttf')
const HEBREW = 'בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים'
function codePointMultiset(value: string): string {
  return [...value.normalize('NFD')]
    .filter((character) => !/\s/u.test(character) && character.replace(BIDI_CONTROLS, '') === character)
    .map((character) => character.codePointAt(0) ?? 0)
    .sort((left, right) => left - right)
    .join(',')
}

function printedDocument(html: string): DocumentInput {
  return {
    type: 'document',
    kind: 'printed',
    settings: { lang: 'he', dir: 'rtl' },
    style: { fonts: { hebrew: { faces: [{ script: 'hebrew' }] } } },
    print: { paper: 'a5' },
    parentRules: [{ parent: 'body' }],
    parentPages: [{ type: 'parentPage', name: 'body', geometry: { margin: { blockStart: 15, blockEnd: 15, inlineStart: 15, inlineEnd: 15 } } }],
    children: [{ type: 'page', body: { html } }],
  }
}

function paginatedBook(html: string): DocumentInput {
  return {
    type: 'document',
    kind: 'book',
    metadata: { title: 'Font fallback' },
    mode: 'paginated',
    style: { fonts: { body: { faces: [{}] } } },
    page: { paper: 'a5', margin: { blockStart: 15, blockEnd: 15, inlineStart: 15, inlineEnd: 15 } },
    children: [{ type: 'division', name: 'body', children: [{ type: 'section', title: 'Fallback', children: [{ type: 'flow', html }] }] }],
  }
}

export async function verifyPrintedPageFonts(renderer: Renderer, work: string, check: Check): Promise<void> {
  const fontSource: FontSource = {
    font: async (name) =>
      name === 'hebrew'
        ? {
            family: 'Noto Serif Hebrew',
            faces: [{ family: 'Noto Serif Hebrew', data: readFileSync(FACE), format: 'truetype', unicodeRange: HEBREW_UNICODE_RANGE }],
            generic: 'serif',
          }
        : undefined,
  }
  const pdf = await renderer.pagePdf(printedDocument(`<p style="font-family:var(--segnavia-font-hebrew);font-size:24pt">${HEBREW}</p>`), { fontSource })
  const file = path.join(work, 'printed-page-hebrew-font.pdf')
  writeFileSync(file, pdf)
  const rows = fontRows(execFileSync('pdffonts', [file], { encoding: 'utf8' }))
  check(
    'a Hebrew printed page embeds its declared face as a subset',
    rows.some((row) => /^[A-Z]{6}\+NotoSerifHebrew-Regular\s/.test(row)),
    rows.join('; '),
  )
  const extracted = execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8' })
  const sourcePoints = codePointMultiset(HEBREW)
  const extractedPoints = codePointMultiset(extracted)
  check(
    'a Hebrew printed page keeps the NFD multiset of base letters, nikud and taamim',
    extractedPoints === sourcePoints,
    `source=${sourcePoints.split(',').length}, extracted=${extractedPoints.split(',').length}`,
  )

  const invalidSource: FontSource = {
    font: async () => ({
      family: 'Broken Declared Face',
      faces: [{ family: 'Broken Declared Face', data: new Uint8Array([0]), format: 'truetype' }],
      generic: 'serif',
    }),
  }
  const reports = async (render: (report: (value: { failures: FontFailure[] }) => void) => Promise<Uint8Array>) => {
    const failures: FontFailure[] = []
    const bytes = await render((value) => failures.push(...value.failures))
    return { failures, bytes }
  }
  const printed = await reports((report) =>
    renderer.pagePdf(printedDocument('<p style="font-family:var(--segnavia-font-hebrew)">printed fallback</p>'), {
      fontSource: invalidSource,
      fontLoad: { report },
    }),
  )
  const book = await reports((report) =>
    renderer.bookPdf(paginatedBook('<p style="font-family:var(--segnavia-font-body)">book fallback</p>'), {
      fontSource: invalidSource,
      fontLoad: { report },
      effects: false,
    }),
  )
  for (const [surface, rendered] of [
    ['printed page', printed],
    ['book', book],
  ] as const) {
    check(
      `a ${surface} reports an unloaded declared face and still renders`,
      rendered.bytes.length > 0 && rendered.failures.some((failure) => failure.reason === 'unloaded'),
      `bytes=${rendered.bytes.length}, failures=${JSON.stringify(rendered.failures)}`,
    )
  }
}
