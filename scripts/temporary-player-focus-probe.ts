import { openHarness } from './verify/harness.ts'
import { verifyPlayer } from './verify/player.ts'

const harness = await openHarness()
try {
  await verifyPlayer(harness)
} finally {
  await harness.close()
}
