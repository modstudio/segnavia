import type { Renderer } from '@segnavia/render'
import { handoutImposition } from '../demo-deck-pdf-fixtures.ts'
import { labelsImposition } from '../demo-page-fixtures.ts'
import { screenDeck, screenPage } from '../screen-document.ts'
import { verifyBookOffline } from './book-offline.ts'

export async function verifyOfflineRender(
  renderer: Renderer,
  origin: string,
  hits: () => number,
  refusal: (work: Promise<unknown>) => Promise<string>,
  check: (what: string, ok: boolean, detail?: string) => void,
) {
  const html = `<img src="${origin}/a.png"><link rel="stylesheet" href="${origin}/b.css"><iframe src="${origin}/c"></iframe><script>fetch("${origin}/d"); new Image().src = "${origin}/e"</script>`
  const unapprovedUrl = `${origin}/a.png`
  const checkOfflineRefusal = async (what: string, work: Promise<unknown>, url = unapprovedUrl) => {
    const result = await refusal(work)
    check(what, result.startsWith('refused:') && result.includes(url) && hits() === 0, `${result}; requests=${hits()}`)
  }
  await checkOfflineRefusal(
    'pagePdf refuses an unapproved asset without reaching the network',
    renderer.pagePdf(screenPage({ html }, { settings: { scripts: 'sandboxed' } }), { waitForPageReady: false }),
  )
  await checkOfflineRefusal('pageImage refuses an unapproved asset without reaching the network', renderer.pageImage(screenPage({ html })))
  await checkOfflineRefusal(
    'imposed pagesPdf refuses an unapproved asset without reaching the network',
    renderer.pagesPdf([screenPage({ html })], { imposition: labelsImposition }),
  )
  await checkOfflineRefusal('bookPdf refuses an unapproved asset without reaching the network', verifyBookOffline(renderer, origin), `${origin}/book.css`)
  const deck = screenDeck([{ type: 'slide', id: 'offline', content: { kind: 'html' as const, html } }], {
    title: 'Offline deck',
    layout: 'fixed' as const,
    fit: 'contain' as const,
    frame: false,
    settings: { scripts: 'sandboxed' as const },
    size: { width: 400, height: 200 },
  })
  await checkOfflineRefusal('deckPdf refuses an unapproved asset without reaching the network', renderer.deckPdf(deck))
  await checkOfflineRefusal('notes deckPdf refuses an unapproved asset without reaching the network', renderer.deckPdf(deck, { layout: 'notes' }))
  await checkOfflineRefusal(
    'imposed deckPdf refuses an unapproved asset without reaching the network',
    renderer.deckPdf(deck, { imposition: handoutImposition }),
  )
  const approvedOrigin = origin.replace('http:', 'https:')
  const approvedOffline = await refusal(
    renderer.pagePdf(screenPage({ html: `<img src="${approvedOrigin}/approved.png"><link rel="stylesheet" href="${approvedOrigin}/approved.css">` }), {
      origins: [
        { origin: approvedOrigin, kinds: ['image'] },
        { origin: approvedOrigin, kinds: ['style'] },
      ],
    }),
  )
  check(
    'an approved request unanswered by assets refuses without reaching the network',
    approvedOffline.startsWith('refused:') &&
      approvedOffline.includes(`${approvedOrigin}/approved.png`) &&
      approvedOffline.includes('did not answer') &&
      hits() === 0,
    `${approvedOffline}; requests=${hits()}`,
  )
  check(
    'refused offline renders reach no server, including book chapter and note resources and top-level deck slides in slides, notes and handout layouts',
    hits() === 0,
    `requests=${hits()}`,
  )
}
