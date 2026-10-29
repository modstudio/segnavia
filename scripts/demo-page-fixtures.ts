import './source-guard.ts'
import type { ImpositionInput, Motif, MotifSource, PageInput } from '@segnavia/format'

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

export const fluidPage: PageInput = {
  html:
    '<!doctype html><html><body style="margin:0;font-family:system-ui,sans-serif"><header style="padding:48px;background:#0f766e;color:#fff"><h1 style="margin:0">A page for the web</h1></header><main style="padding:48px;max-width:720px">' +
    "<p>Pages have no paper. This one is fluid: it renders at the viewer's width and as tall as its content.</p>".repeat(12) +
    '</main><script>document.body.style.background = "red"</script></body></html>',
  size: 'fluid',
}

export const hebrewPage: PageInput = {
  html: '<h1 style="font-family:sans-serif">שלום</h1><p>A page set right to left.</p>',
  size: { width: 600, height: 'auto' },
  dir: 'rtl',
  lang: 'he',
}

export const ownDirectionPage: PageInput = {
  html: '<p dir="ltr">שלום This sentence stays left to right.</p>',
  size: { width: 600, height: 'auto' },
  dir: 'rtl',
  lang: 'he',
}

export const rightToLeftDivPage: PageInput = {
  html: [
    '<div>English text directly in a div.</div>',
    '<section>English text directly in a section.</section>',
    '<article>English text directly in an article.</article>',
    '<aside>English text directly in an aside.</aside>',
    '<address>English text directly in an address.</address>',
  ].join(''),
  size: { width: 600, height: 'auto' },
  dir: 'rtl',
  lang: 'he',
}

export const fixedPage: PageInput = {
  html: '<div style="font:24px sans-serif">Fixed page</div>',
  size: { width: 420, height: 240 },
}

export const marginPage: PageInput = {
  html: '<span style="font:12px sans-serif">MARGIN_MARKER</span>',
  size: 'fluid',
  print: { paper: 'letter', orientation: 'portrait', margin: { top: 15, right: 15, bottom: 15, left: 15 } },
}

export const postcardPage: PageInput = {
  html: '<!doctype html><html style="margin:0;background:#b9e6df"><body style="margin:0;padding:var(--segnavia-safe);font:18px system-ui,sans-serif">Greetings from Segnavia.</body></html>',
  size: 'fluid',
  print: {
    paper: { width: 148, height: 105, unit: 'mm' },
    orientation: 'landscape',
    bleed: 3,
    safe: 5,
    marks: true,
  },
}

export const postcardBackPage: PageInput = {
  ...postcardPage,
  html: '<!doctype html><html style="margin:0;background:#f7c8a8"><body style="margin:0;padding:var(--segnavia-safe);font:18px system-ui,sans-serif">The other side of the postcard.</body></html>',
}

const labelColors = ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#ede9fe', '#ffedd5']
export const labelPages: PageInput[] = Array.from({ length: 31 }, (_, index) => ({
  html: `<html style="background:${labelColors[index % labelColors.length]};font:10px sans-serif"><body><p>Label ${index + 1}</p></body></html>`,
  size: 'fluid',
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

export const twoSidedCardPages: PageInput[] = Array.from({ length: 8 }, (_, index) => {
  const face = index % 2 === 0 ? 'Front' : 'Back'
  const piece = Math.floor(index / 2) + 1
  const shade = face === 'Front' ? 220 : 170
  return {
    html: `<!doctype html><html style="margin:0;background:rgb(${shade},${shade},${shade})"><body style="margin:0;font:14px sans-serif"><p>${face} ${piece}</p></body></html>`,
    size: 'fluid',
  }
})

export const twoSidedSequenceImposition: ImpositionInput = {
  ...twoSidedCardImposition,
  rows: 1,
  margin: { top: 15, right: 25, bottom: 95, left: 10 },
}

export const fixedImposedPage: PageInput = {
  html: '<!doctype html><html style="margin:0;background:rgb(80,80,80)"><body style="margin:0"></body></html>',
  size: { width: 600, height: 400 },
}

const fixedImposition: ImpositionInput = {
  paper: { width: 120, height: 90, unit: 'mm' },
  orientation: 'landscape',
  columns: 1,
  rows: 1,
  cell: { width: 100, height: 70 },
  margin: { top: 10, right: 10, bottom: 10, left: 10 },
  bleed: 3,
}

export const coveringImposition: ImpositionInput = { ...fixedImposition, fit: 'cover' }
export const containedImposition: ImpositionInput = { ...fixedImposition, fit: 'contain' }

export const bleedGridShades = [60, 100, 140, 180]
export const bleedGridPages: PageInput[] = bleedGridShades.map((shade) => ({
  html: `<!doctype html><html style="margin:0;background:rgb(${shade},${shade},${shade})"><body style="margin:0"></body></html>`,
  size: 'fluid',
}))

const bleedGrid: ImpositionInput = {
  paper: { width: 56, height: 56, unit: 'mm' },
  columns: 2,
  rows: 2,
  cell: { width: 20, height: 20 },
  margin: { top: 5, right: 5, bottom: 5, left: 5 },
  gap: { column: 6, row: 6 },
  bleed: 2,
}

export const bleedGridImposition = bleedGrid
export const clippedBleedGridImposition: ImpositionInput = {
  ...bleedGrid,
  paper: { width: 52, height: 52, unit: 'mm' },
  gap: { column: 2, row: 2 },
}

export const growingFixedPages: PageInput[] = [70, 170].map((shade) => ({
  html: `<!doctype html><html style="margin:0;background:rgb(${shade},${shade},${shade})"><body style="margin:0"></body></html>`,
  size: { width: 200, height: 'auto' },
}))

export const letterFoldPages: PageInput[] = Array.from({ length: 6 }, (_, index) => ({
  html: `<!doctype html><html style="margin:0;background:#f4f4f5"><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100%;font:48px sans-serif">${index + 1}</body></html>`,
  size: 'fluid',
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
  bleed: 2,
}

const parentPages = {
  parents: [
    {
      name: 'body',
      margin: { top: 18, bottom: 18, inner: 22, outer: 12 },
      foot: '<footer data-motif="printed-foot"></footer>',
    },
    {
      name: 'first',
      basedOn: 'body',
      margin: { top: 30, bottom: 18, inner: 22, outer: 12 },
      head: '<header data-motif="printed-head"></header>',
    },
  ],
  rules: { every: 'body', first: 'first' },
}

const flowingLines = (prefix: string, count: number, breaks: number[]) =>
  Array.from({ length: count }, (_, index) => `<p${breaks.includes(index) ? ' class="forced"' : ''}>${prefix}-${index + 1} flowing body</p>`).join('')

const flowingCss =
  '<style>body{font:14px sans-serif}p{margin:0 0 7px}.forced{break-before:page}.keep{break-inside:avoid}.widow{widows:2;orphans:2;line-height:20px}.widow-space{block-size:360px}</style>'

export const parentPageEnglish: PageInput = {
  html: `${flowingCss}${flowingLines('English', 20, [])}<div class="widow-space"></div><p class="widow">WIDOW-1<br>WIDOW-2<br>WIDOW-3<br>WIDOW-4</p>${Array.from({ length: 35 }, (_, index) => `<p${index === 20 ? ' class="forced"' : ''}>English-${index + 21} flowing body</p>`).join('')}<div class="keep">KEEP-A<br>KEEP-B<br>KEEP-C</div>`,
  lang: 'en',
  print: { paper: 'letter' },
  printedPages: parentPages,
}

export const parentPageHebrew: PageInput = {
  html: `${flowingCss}${flowingLines('עברית', 34, [18])}`,
  lang: 'he',
  dir: 'rtl',
  print: { paper: 'letter' },
  printedPages: parentPages,
}

export const parentPageMixed: PageInput = {
  html: `${flowingCss}<p>English opening בתוך מסמך mixed.</p>${flowingLines('Mixed', 32, [17])}`,
  lang: 'he',
  dir: 'rtl',
  print: { paper: 'letter' },
  printedPages: parentPages,
}

export const printedParentPageCases = [
  { name: 'english', page: parentPageEnglish },
  { name: 'hebrew', page: parentPageHebrew },
  { name: 'mixed', page: parentPageMixed },
] as const

const imageWords = Array.from({ length: 220 }, (_, index) => `<span>ImageWord-${index + 1} </span>`)
const unsizedImage = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="420"><rect width="240" height="420" fill="#ddd"/></svg>')

export const parentPageUnsizedImage: PageInput = {
  html: `${flowingCss}<p>${imageWords.slice(0, 110).join('')}</p><img src="data:image/svg+xml,${unsizedImage}"><p>${imageWords.slice(110).join('')}</p>`,
  lang: 'en',
  print: { paper: 'letter' },
  printedPages: parentPages,
}

export const parentPageNarrowBreak: PageInput = {
  html: `${flowingCss}<p>Wide opening</p><div style="break-before:page;break-after:page;inline-size:40%">${Array.from({ length: 30 }, (_, index) => `<div>Narrow-${index + 1}</div>`).join('')}</div><p>Wide ending</p>`,
  lang: 'en',
  print: { paper: 'letter' },
  printedPages: parentPages,
}

export const parentPageFurnitureOverflow: PageInput = {
  html: `${flowingCss}<p>Furniture overflow body</p>`,
  lang: 'en',
  print: { paper: 'letter' },
  printedPages: {
    parents: [
      {
        name: 'body',
        margin: { top: 18, bottom: 18, inner: 22, outer: 12 },
        head: '<div style="block-size:200px">Too-tall furniture</div>',
      },
    ],
    rules: { every: 'body' },
  },
}
