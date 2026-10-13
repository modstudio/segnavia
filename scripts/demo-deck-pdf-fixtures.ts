import { Deck, type Scripts } from '@segnavia/format'

export const deckPdfShades = { root: 60, body: 120, div: 180 } as const

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
