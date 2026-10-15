import { openHarness } from './verify/harness.ts'
import { verifyRailAuthoring } from './verify/rail-authoring.ts'

const h = await openHarness()
try {
  await verifyRailAuthoring(h)
} finally {
  await h.close()
}
process.exit(h.failures() === 0 ? 0 : 1)
