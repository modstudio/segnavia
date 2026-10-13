import { Deck, type ImpositionInput, type Scripts, type Shot } from '@segnavia/format'

export const deckPdfShades = { root: 60, body: 120, div: 180 } as const

export const handoutImposition = {
  paper: 'letter',
  orientation: 'portrait',
  unit: 'mm',
  columns: 2,
  rows: 3,
  cell: { width: 90, height: 70 },
  margin: { top: 12, right: 12, bottom: 12, left: 12 },
  gap: { column: 8, row: 8 },
  bleed: 0,
  fit: 'contain',
} satisfies ImpositionInput

export function backgroundDeck(scripts: Scripts, image: string) {
  return Deck.parse({
    title: `PDF backgrounds ${scripts}`,
    scripts,
    slides: [
      {
        id: 'root-background',
        content: { kind: 'html', html: '<style>html{background:rgb(60,60,60)}</style><h1>Root background</h1>' },
        notes: 'Root background notes.',
      },
      {
        id: 'body-background',
        content: { kind: 'html', html: '<style>body{margin:0;min-height:100vh;background:rgb(120,120,120)}</style><h1>Body background</h1>' },
        notes: 'Body background notes.',
      },
      {
        id: 'div-background',
        content: {
          kind: 'html',
          html: '<style>html,body{margin:0}div{position:absolute;left:200px;top:120px;width:400px;height:240px;background:rgb(180,180,180)}</style><div>Div background</div>',
        },
        notes: 'Div background notes.',
      },
      { id: 'image', content: { kind: 'image', src: image, alt: 'The captured class list' }, notes: 'Image slide notes.' },
    ],
  })
}

export function handoutDeck(scripts: Scripts, image: string, shot: Shot) {
  return Deck.parse({
    title: `PDF handout ${scripts}`,
    scripts,
    slides: [
      { id: 'root-background', content: { kind: 'html', html: '<style>html{background:rgb(60,60,60)}</style><h1>Slide 1</h1>' } },
      {
        id: 'body-background',
        content: { kind: 'html', html: '<style>body{margin:0;min-height:100vh;background:rgb(120,120,120)}</style><h1>Slide 2</h1>' },
      },
      {
        id: 'div-background',
        content: {
          kind: 'html',
          html: '<style>html,body{margin:0}div{position:absolute;left:200px;top:120px;width:400px;height:240px;background:rgb(180,180,180)}</style><div>Slide 3</div>',
        },
      },
      { id: 'image', content: { kind: 'image', src: image, alt: 'Slide 4 image' } },
      { id: 'shot', content: { kind: 'shot', src: image, shot } },
      { id: 'six', content: { kind: 'html', html: '<style>html{background:#eee}</style><h1>Slide 6</h1>' } },
      { id: 'seven', content: { kind: 'html', html: '<style>html{background:#ddd}</style><h1>Slide 7</h1>' } },
    ],
  })
}
