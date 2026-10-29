// Plays the published decks and pages in a real browser and checks what is on
// the screen: the right slide, word and annotations, the frame's policy and
// bridge, right to left throughout, and a host-built player on the headless
// elements.

import { verifyBoard } from './verify/board.ts'
import { verifyBooks } from './verify/books.ts'
import { verifyBoundedPage } from './verify/bounded-page.ts'
import { verifyCapture } from './verify/capture.ts'
import { verifyComponents } from './verify/components.ts'
import { verifyCssSanitizer } from './verify/css-sanitizer.ts'
import { verifyDeckHost } from './verify/deck-host.ts'
import { verifyDocuments } from './verify/documents.ts'
import { openHarness } from './verify/harness.ts'
import { verifyHeadless } from './verify/headless.ts'
import { verifyImageFit } from './verify/image-fit.ts'
import { verifyMedia } from './verify/media.ts'
import { verifyPages } from './verify/pages.ts'
import { verifyPaperPicker } from './verify/paper-picker.ts'
import { verifyPapers } from './verify/papers.ts'
import { verifyPlayer } from './verify/player.ts'
import { verifyPlayerLayout } from './verify/player-layout.ts'
import { verifyRailAuthoring } from './verify/rail-authoring.ts'
import { verifyResponsive } from './verify/responsive.ts'
import { verifyRtl } from './verify/rtl.ts'
import { verifySelection } from './verify/selection.ts'
import { verifySlots } from './verify/slots.ts'
import { verifyThumbnail } from './verify/thumbnail.ts'
import { parseVerifyShard, sectionsForShard, unlistedSections, VERIFY_DEMO_SECTIONS_BY_DURATION } from './verify-demo-shards.ts'

type VerifySection = Readonly<{ name: string; run: () => void | Promise<void> }>

const sections: readonly VerifySection[] = [
  { name: 'verifyCapture', run: () => verifyCapture(h) },
  { name: 'verifyPlayer', run: () => verifyPlayer(h) },
  { name: 'verifyPlayerLayout', run: () => verifyPlayerLayout(h) },
  { name: 'verifyRailAuthoring', run: () => verifyRailAuthoring(h) },
  { name: 'verifyPages', run: () => verifyPages(h) },
  { name: 'verifyBooks', run: () => verifyBooks(h) },
  { name: 'verifyBoard', run: () => verifyBoard(h) },
  { name: 'verifyPapers', run: () => verifyPapers(h) },
  { name: 'verifyPaperPicker', run: () => verifyPaperPicker(h) },
  { name: 'verifyDocuments', run: () => verifyDocuments(h) },
  { name: 'verifyRtl', run: () => verifyRtl(h) },
  { name: 'verifySelection', run: () => verifySelection(h) },
  { name: 'verifyBoundedPage', run: () => verifyBoundedPage(h) },
  { name: 'verifyHeadless', run: () => verifyHeadless(h) },
  { name: 'verifyThumbnail', run: () => verifyThumbnail(h) },
  { name: 'verifySlots', run: () => verifySlots(h) },
  { name: 'verifyImageFit', run: () => verifyImageFit(h) },
  { name: 'verifyComponents', run: () => verifyComponents(h) },
  { name: 'verifyCssSanitizer', run: () => verifyCssSanitizer(h) },
  { name: 'verifyDeckHost', run: () => verifyDeckHost(h) },
  { name: 'verifyMedia', run: () => verifyMedia(h) },
  { name: 'verifyResponsive', run: () => verifyResponsive(h) },
]

const listing = unlistedSections(
  sections.map((section) => section.name),
  VERIFY_DEMO_SECTIONS_BY_DURATION,
)
if (listing.unlisted.length > 0 || listing.stale.length > 0) {
  throw new Error(
    `VERIFY_DEMO_SECTIONS_BY_DURATION in verify-demo-shards.ts must name every section exactly: add ${listing.unlisted.join(', ') || 'none'}; remove ${listing.stale.join(', ') || 'none'}.`,
  )
}
const shard = parseVerifyShard(process.env.SEGNAVIA_VERIFY_SHARD)
// The sections reach the harness only when they run, so the listing is refused before a browser starts.
const h = await openHarness()
const selected = sectionsForShard(VERIFY_DEMO_SECTIONS_BY_DURATION, shard)
try {
  for (const section of sections) {
    if (!selected.has(section.name)) continue
    console.log(`section ${section.name}`)
    await h.page.setViewportSize({ width: 1280, height: 816 })
    await section.run()
  }
  h.check('no errors in any page', h.errors.length === 0, h.errors.join('; '))
} finally {
  await h.close()
}
console.log(h.failures() === 0 ? 'all checks passed' : `${h.failures()} checks failed`)
process.exit(h.failures() === 0 ? 0 : 1)
