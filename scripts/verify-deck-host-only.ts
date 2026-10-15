import { verifyDeckHost } from './verify/deck-host.ts'
import { openHarness } from './verify/harness.ts'

const h = await openHarness()
try {
  await verifyDeckHost(h)
} finally {
  await h.close()
}
process.exit(h.failures() === 0 ? 0 : 1)
