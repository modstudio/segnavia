import './source-guard.ts'
import type { DocumentInput, ImpositionInput, Motif, MotifSource, PrintedPageRules } from '@segnavia/format'

export * from './demo-screen-page-fixtures.ts'

export const printedPageMotifs: Motif[] = [
  {
    key: 'printed-head',
    revision: 'demo',
    label: 'Printed head',
    fields: [],
    fonts: [],
    versions: [
      { lang: 'en', html: '<bdi>LETTERHEAD</bdi>' },
      { lang: 'he', html: '<bdi>כותרת</bdi>' },
    ],
  },
  {
    key: 'printed-foot',
    revision: 'demo',
    label: 'Printed foot',
    fields: [],
    fonts: [],
    versions: [
      { lang: 'en', html: '<bdi>Page <span data-slot-value="printedPage.number"></span> of <span data-slot-value="printedPage.total"></span></bdi>' },
      { lang: 'he', html: '<bdi>עמוד <span data-slot-value="printedPage.number"></span> מתוך <span data-slot-value="printedPage.total"></span></bdi>' },
    ],
  },
]

export const printedPageMotifSource: MotifSource = {
  motif: async (key: string) => printedPageMotifs.find((motif) => motif.key === key),
}

export const fixedPage: DocumentInput = {
  type: 'document',
  kind: 'page',
  size: { width: 420, height: 240 },
  children: [{ type: 'page', body: { html: '<div style="font:24px sans-serif">Fixed page</div>' } }],
}

export const marginPage: DocumentInput = {
  type: 'document',
  kind: 'page',
  size: 'fluid',
  print: { paper: 'letter', orientation: 'portrait', margin: { blockStart: 15, blockEnd: 15, inlineStart: 15, inlineEnd: 15 } },
  children: [{ type: 'page', body: { html: '<span style="font:12px sans-serif">MARGIN_MARKER</span>' } }],
}

export const postcardPage: DocumentInput = {
  type: 'document',
  kind: 'page',
  size: 'fluid',
  print: {
    paper: { width: 148, height: 105, unit: 'mm' },
    orientation: 'landscape',
    bleed: 3,
    safe: 5,
    marks: true,
  },
  children: [
    {
      type: 'page',
      body: {
        html: '<!doctype html><html style="margin:0;background:#b9e6df"><body style="margin:0;padding:var(--segnavia-safe);font:18px system-ui,sans-serif">Greetings from Segnavia.</body></html>',
      },
    },
  ],
}

export const postcardBackPage: DocumentInput = {
  ...postcardPage,
  children: [
    {
      type: 'page',
      body: {
        html: '<!doctype html><html style="margin:0;background:#f7c8a8"><body style="margin:0;padding:var(--segnavia-safe);font:18px system-ui,sans-serif">The other side of the postcard.</body></html>',
      },
    },
  ],
}

const labelColors = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#ede9fe', '#ffedd5']
export const labelPages: DocumentInput[] = Array.from({ length: 31 }, (_, index) => ({
  type: 'document',
  kind: 'page',
  size: 'fluid',
  children: [
    {
      type: 'page',
      body: { html: `<html style="background:${labelColors[index % labelColors.length]};font:10px sans-serif"><body><p>Label ${index + 1}</p></body></html>` },
    },
  ],
}))

export const labelsImposition: ImpositionInput = {
  paper: 'letter',
  orientation: 'portrait',
  unit: 'in',
  columns: 3,
  rows: 10,
  cell: { width: 2.625, height: 1 },
  margin: { top: 0.5, right: 0, bottom: 0, left: 0.1875 },
  gap: { column: 0.125, row: 0 },
}

export const twoSidedCardImposition: ImpositionInput = {
  paper: { width: 120, height: 160, unit: 'mm' },
  columns: 2,
  rows: 2,
  cell: { width: 40, height: 50 },
  margin: { top: 15, right: 25, bottom: 40, left: 10 },
  gap: { column: 5, row: 5 },
  sides: 'two',
  flip: 'long',
}

export const twoSidedCardPages: DocumentInput[] = Array.from({ length: 8 }, (_, index) => {
  const face = index % 2 === 0 ? 'Front' : 'Back'
  const piece = Math.floor(index / 2) + 1
  const shade = face === 'Front' ? 220 : 170
  return {
    type: 'document',
    kind: 'page',
    size: 'fluid',
    children: [
      {
        type: 'page',
        body: {
          html: `<!doctype html><html style="margin:0;background:rgb(${shade},${shade},${shade})"><body style="margin:0;font:14px sans-serif"><p>${face} ${piece}</p></body></html>`,
        },
      },
    ],
  }
})

export const twoSidedSequenceImposition: ImpositionInput = {
  ...twoSidedCardImposition,
  rows: 1,
  margin: { top: 15, right: 25, bottom: 95, left: 10 },
}

export const fixedImposedPage: DocumentInput = {
  type: 'document',
  kind: 'page',
  size: { width: 600, height: 400 },
  print: { paper: { width: 100, height: 70, unit: 'mm' }, orientation: 'landscape', bleed: 3 },
  children: [{ type: 'page', body: { html: '<!doctype html><html style="margin:0;background:rgb(80,80,80)"><body style="margin:0"></body></html>' } }],
}

const fixedImposition: ImpositionInput = {
  paper: { width: 120, height: 90, unit: 'mm' },
  orientation: 'landscape',
  columns: 1,
  rows: 1,
  cell: { width: 100, height: 70 },
  margin: { top: 10, right: 10, bottom: 10, left: 10 },
}

export const coveringImposition: ImpositionInput = { ...fixedImposition, fit: 'cover' }
export const containedImposition: ImpositionInput = { ...fixedImposition, fit: 'contain' }

export const bleedGridShades = [60, 100, 140, 180]
export const bleedGridPages: DocumentInput[] = bleedGridShades.map((shade) => ({
  type: 'document',
  kind: 'page',
  size: 'fluid',
  print: { paper: { width: 20, height: 20, unit: 'mm' }, bleed: 2 },
  children: [
    { type: 'page', body: { html: `<!doctype html><html style="margin:0;background:rgb(${shade},${shade},${shade})"><body style="margin:0"></body></html>` } },
  ],
}))

const bleedGrid: ImpositionInput = {
  paper: { width: 56, height: 56, unit: 'mm' },
  columns: 2,
  rows: 2,
  cell: { width: 20, height: 20 },
  margin: { top: 5, right: 5, bottom: 5, left: 5 },
  gap: { column: 6, row: 6 },
}

export const bleedGridImposition = bleedGrid
export const clippedBleedGridImposition: ImpositionInput = {
  ...bleedGrid,
  paper: { width: 52, height: 52, unit: 'mm' },
  gap: { column: 2, row: 2 },
}

export const growingFixedPages: DocumentInput[] = [70, 170].map((shade) => ({
  type: 'document',
  kind: 'page',
  size: { width: 200, height: 'auto' },
  print: { paper: { width: 20, height: 20, unit: 'mm' }, bleed: 2 },
  children: [
    { type: 'page', body: { html: `<!doctype html><html style="margin:0;background:rgb(${shade},${shade},${shade})"><body style="margin:0"></body></html>` } },
  ],
}))

export const letterFoldPages: DocumentInput[] = Array.from({ length: 6 }, (_, index) => ({
  type: 'document',
  kind: 'page',
  size: 'fluid',
  children: [
    {
      type: 'page',
      body: {
        html: `<!doctype html><html style="margin:0;background:#f4f4f5"><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100%;font:48px sans-serif">${index + 1}</body></html>`,
      },
    },
  ],
}))

export const letterFoldImposition: ImpositionInput = {
  paper: 'letter',
  orientation: 'landscape',
  fold: 'letter',
  cell: { height: 215.9 },
  marks: true,
}

export const growingFixedImposition: ImpositionInput = {
  paper: { width: 44, height: 24, unit: 'mm' },
  orientation: 'landscape',
  columns: 2,
  rows: 1,
  cell: { width: 20, height: 20 },
  margin: { top: 2, right: 2, bottom: 2, left: 2 },
  gap: { column: 0, row: 0 },
}

const parentPages = {
  parents: [
    {
      name: 'body',
      margin: { blockStart: 18, blockEnd: 18, inlineStart: 22, inlineEnd: 12 },
      foot: '<footer data-motif="printed-foot"></footer>',
    },
    {
      name: 'first',
      basedOn: 'body',
      margin: { blockStart: 30, blockEnd: 18, inlineStart: 22, inlineEnd: 12 },
      head: '<header data-motif="printed-head"></header>',
    },
  ],
  rules: { every: 'body', first: 'first' },
}

function printedDocument(input: {
  html: string
  lang: string
  dir?: 'ltr' | 'rtl'
  parents?: Array<{
    name: string
    basedOn?: string
    margin: { blockStart: number; blockEnd: number; inlineStart: number; inlineEnd: number }
    head?: string
    foot?: string
  }>
  rules?: PrintedPageRules
}): DocumentInput {
  const parents = input.parents ?? parentPages.parents
  return {
    type: 'document',
    kind: 'printed',
    settings: { lang: input.lang, dir: input.dir },
    print: { paper: 'letter' },
    parentPages: parents.map(({ margin, ...parent }) => ({ type: 'parentPage', ...parent, geometry: { margin } })),
    rules: input.rules ?? parentPages.rules,
    children: [{ type: 'page', body: { html: input.html } }],
  }
}

const flowingLines = (prefix: string, count: number, breaks: number[]) =>
  Array.from({ length: count }, (_, index) => `<p${breaks.includes(index) ? ' class="forced"' : ''}>${prefix}-${index + 1} flowing body</p>`).join('')

const flowingCss =
  '<style>body{font:14px sans-serif}p{margin:0 0 7px}.forced{break-before:page}.keep{break-inside:avoid}.widow{widows:2;orphans:2;line-height:20px}.widow-space{block-size:360px}</style>'

export const parentPageEnglish: DocumentInput = printedDocument({
  html: `${flowingCss}${flowingLines('English', 20, [])}<div class="widow-space"></div><p class="widow">WIDOW-1<br>WIDOW-2<br>WIDOW-3<br>WIDOW-4</p>${Array.from({ length: 35 }, (_, index) => `<p${index === 20 ? ' class="forced"' : ''}>English-${index + 21} flowing body</p>`).join('')}<div class="keep">KEEP-A<br>KEEP-B<br>KEEP-C</div>`,
  lang: 'en',
})

export const parentPageHebrew: DocumentInput = printedDocument({
  html: `${flowingCss}${flowingLines('עברית', 34, [18])}`,
  lang: 'he',
  dir: 'rtl',
})

export const parentPageMixed: DocumentInput = printedDocument({
  html: `${flowingCss}<p>English opening בתוך מסמך mixed.</p>${flowingLines('Mixed', 32, [17])}`,
  lang: 'he',
  dir: 'rtl',
})

export const printedParentPageCases = [
  { name: 'english', page: parentPageEnglish },
  { name: 'hebrew', page: parentPageHebrew },
  { name: 'mixed', page: parentPageMixed },
] as const

export const printedSectionDocument: DocumentInput = {
  type: 'document',
  kind: 'printed',
  settings: { lang: 'en' },
  print: { paper: 'letter' },
  parentPages: [
    {
      type: 'parentPage',
      name: 'cover',
      geometry: { margin: { blockStart: 18, blockEnd: 18, inlineStart: 18, inlineEnd: 18 } },
    },
    {
      type: 'parentPage',
      name: 'body',
      geometry: { margin: { blockStart: 18, blockEnd: 18, inlineStart: 18, inlineEnd: 18 } },
      foot: '<footer>Page <span data-slot-value="printedPage.number"></span> of <span data-slot-value="printedPage.total"></span></footer>',
    },
  ],
  rules: { every: 'body', first: 'cover' },
  children: [
    {
      type: 'section',
      id: 'cover',
      title: 'Cover',
      opens: 'any',
      numbering: { counted: false },
      children: [{ type: 'flow', html: '<div style="block-size:243.4mm;font:24px sans-serif">SECTIONED COVER</div>' }],
    },
    {
      type: 'section',
      id: 'body',
      title: 'Body',
      opens: 'any',
      children: [
        {
          type: 'flow',
          html: '<div style="block-size:243.4mm;font:18px sans-serif">SECTIONED BODY ONE</div><div style="block-size:243.4mm;font:18px sans-serif">SECTIONED BODY TWO</div>',
        },
      ],
    },
  ],
}

const imageWords = Array.from({ length: 220 }, (_, index) => `<span>ImageWord-${index + 1} </span>`)
const unsizedImage = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="420"><rect width="240" height="420" fill="#ddd"/></svg>')

export const parentPageUnsizedImage: DocumentInput = printedDocument({
  html: `${flowingCss}<p>${imageWords.slice(0, 110).join('')}</p><img src="data:image/svg+xml,${unsizedImage}"><p>${imageWords.slice(110).join('')}</p>`,
  lang: 'en',
})

export const parentPageNarrowBreak: DocumentInput = printedDocument({
  html: `${flowingCss}<p>Wide opening</p><div style="break-before:page;break-after:page;inline-size:40%">${Array.from({ length: 30 }, (_, index) => `<div>Narrow-${index + 1}</div>`).join('')}</div><p>Wide ending</p>`,
  lang: 'en',
})

export const parentPageFurnitureOverflow: DocumentInput = printedDocument({
  html: `${flowingCss}<p>Furniture overflow body</p>`,
  lang: 'en',
  parents: [
    {
      name: 'body',
      margin: { blockStart: 18, blockEnd: 18, inlineStart: 22, inlineEnd: 12 },
      head: '<div style="block-size:200px">Too-tall furniture</div>',
    },
  ],
  rules: { every: 'body' },
})
