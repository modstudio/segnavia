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
import { verifyPaperPicker } from './verify/paper-picker.ts'
import { verifyPapers } from './verify/papers.ts'
import { verifyPlayer } from './verify/player.ts'
import { verifyPlayerLayout } from './verify/player-layout.ts'
import { verifyRailAuthoring } from './verify/rail-authoring.ts'
import { verifyResponsive } from './verify/responsive.ts'
import { verifyRtl } from './verify/rtl.ts'
import { verifyThumbnail } from './verify/thumbnail.ts'
import { parseVerifyShard, sectionsForShard } from './verify-demo-shards.ts'

type VerifySection = Readonly<{ name: string; run: () => void | Promise<void> }>

const h = await openHarness()
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
  { name: 'verifyHeadless', run: () => verifyHeadless(h) },
  { name: 'verifyThumbnail', run: () => verifyThumbnail(h) },
  { name: 'verifyImageFit', run: () => verifyImageFit(h) },
  { name: 'verifyComponents', run: () => verifyComponents(h) },
  { name: 'verifyDeckHost', run: () => verifyDeckHost(h) },
  { name: 'verifyMedia', run: () => verifyMedia(h) },
  { name: 'verifyResponsive', run: () => verifyResponsive(h) },
]

// Slowest first from a local macOS run, in seconds: player 20.5, player layout
// 13.3, RTL 11.0, deck host 8.4, rail authoring 8.2, papers 6.5, headless
// 4.5, media 4.5, components 1.9, and the remaining sections under 1 each.
// Round-robin assignment from this fixed order keeps the common three shards
// close in duration. Sections still execute in their original order below.
const sectionsByDuration = [
  'verifyPlayer',
  'verifyPlayerLayout',
  'verifyRtl',
  'verifyDeckHost',
  'verifyRailAuthoring',
  'verifyPapers',
  'verifyHeadless',
  'verifyMedia',
  'verifyComponents',
  'verifyPages',
  'verifyBooks',
  'verifyBoard',
  'verifyDocuments',
  'verifyResponsive',
  'verifyPaperPicker',
  'verifyThumbnail',
  'verifyImageFit',
  'verifyCapture',
] as const

const shard = parseVerifyShard(process.env.SEGNAVIA_VERIFY_SHARD)
const selected = sectionsForShard(sectionsByDuration, shard)
try {
  for (const section of sections) {
    if (!selected.has(section.name)) continue
    console.log(`section ${section.name}`)
    await section.run()
  }
  h.check('no errors in any page', h.errors.length === 0, h.errors.join('; '))
} finally {
  await h.close()
}
console.log(h.failures() === 0 ? 'all checks passed' : `${h.failures()} checks failed`)
process.exit(h.failures() === 0 ? 0 : 1)
