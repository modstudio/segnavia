// Plays the published decks and pages in a real browser and checks what is on
// the screen: the right slide, word and annotations, the frame's policy and
// bridge, right to left throughout, and a host-built player on the headless
// elements.

import { verifyCapture } from './verify/capture.ts'
import { verifyComponents } from './verify/components.ts'
import { openHarness } from './verify/harness.ts'
import { verifyHeadless } from './verify/headless.ts'
import { verifyMedia } from './verify/media.ts'
import { verifyPages } from './verify/pages.ts'
import { verifyPlayer } from './verify/player.ts'
import { verifyRtl } from './verify/rtl.ts'

const h = await openHarness()
try {
  verifyCapture(h)
  await verifyPlayer(h)
  await verifyPages(h)
  await verifyRtl(h)
  await verifyHeadless(h)
  await verifyComponents(h)
  await verifyMedia(h)
  h.check('no errors in any page', h.errors.length === 0, h.errors.join('; '))
} finally {
  await h.close()
}
console.log(h.failures() === 0 ? 'all checks passed' : `${h.failures()} checks failed`)
process.exit(h.failures() === 0 ? 0 : 1)
