// Plays the published decks and pages in a real browser and checks what is on
// the screen: the right slide, word and annotations, the frame's policy and
// bridge, right to left throughout, and a host-built player on the headless
// elements.

import { verifyBoard } from './verify/board.ts'
import { verifyBooks } from './verify/books.ts'
import { verifyCapture } from './verify/capture.ts'
import { verifyComponents } from './verify/components.ts'
import { verifyDeckHost } from './verify/deck-host.ts'
import { verifyDocuments } from './verify/documents.ts'
import { openHarness } from './verify/harness.ts'
import { verifyHeadless } from './verify/headless.ts'
import { verifyImageFit } from './verify/image-fit.ts'
import { verifyMedia } from './verify/media.ts'
import { verifyPages } from './verify/pages.ts'
import { verifyPapers } from './verify/papers.ts'
import { verifyPlayer } from './verify/player.ts'
import { verifyPlayerLayout } from './verify/player-layout.ts'
import { verifyRailAuthoring } from './verify/rail-authoring.ts'
import { verifyResponsive } from './verify/responsive.ts'
import { verifyRtl } from './verify/rtl.ts'
import { verifyThumbnail } from './verify/thumbnail.ts'

const h = await openHarness()
try {
  verifyCapture(h)
  await verifyPlayer(h)
  await verifyPlayerLayout(h)
  await verifyRailAuthoring(h)
  await verifyPages(h)
  await verifyBooks(h)
  await verifyBoard(h)
  await verifyPapers(h)
  await verifyDocuments(h)
  await verifyRtl(h)
  await verifyHeadless(h)
  await verifyThumbnail(h)
  await verifyImageFit(h)
  await verifyComponents(h)
  await verifyDeckHost(h)
  await verifyMedia(h)
  await verifyResponsive(h)
  h.check('no errors in any page', h.errors.length === 0, h.errors.join('; '))
} finally {
  await h.close()
}
console.log(h.failures() === 0 ? 'all checks passed' : `${h.failures()} checks failed`)
process.exit(h.failures() === 0 ? 0 : 1)
