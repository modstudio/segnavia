import { BOUNDED_WAIT_MS, type Harness } from './harness.ts'

type Locator = ReturnType<Harness['page']['locator']>
type SelectionResult = { selected: boolean; attempts: number; detail: string }

// Nested framed pages report their heights asynchronously, so a locked block can move after Playwright's actionability check and a click can miss it. A click that reaches the block must select it.
export async function selectStableLockedAtom(page: Harness['page'], atom: Locator, describeSelection: () => Promise<string>): Promise<SelectionResult> {
  const selected = atom.and(page.locator('.ProseMirror-selectednode'))
  const waitForStableBox = async () => {
    let previous = ''
    for (const deadline = Date.now() + BOUNDED_WAIT_MS; Date.now() < deadline; await page.waitForTimeout(50)) {
      const box = await atom.boundingBox()
      const current = box ? JSON.stringify(box) : ''
      if (current && current === previous) return true
      previous = current
    }
    return false
  }
  let lastFailure = ''
  for (let attempts = 1; attempts <= 3; attempts++) {
    try {
      if (!(await waitForStableBox())) return { selected: false, attempts, detail: `locked block bounding box did not stabilize before attempt ${attempts}` }
      await atom.evaluate((element) => {
        const target = element as HTMLElement & { verifierMousedownReached?: boolean }
        target.verifierMousedownReached = false
        target.addEventListener('mousedown', () => (target.verifierMousedownReached = true), { capture: true, once: true })
      })
      await atom.click({ position: { x: 2, y: 2 }, timeout: BOUNDED_WAIT_MS })
      await selected.waitFor({ timeout: BOUNDED_WAIT_MS }).catch(() => {})
      if ((await selected.count()) > 0) return { selected: true, attempts, detail: '' }
      const reached = await atom.evaluate((element) => (element as HTMLElement & { verifierMousedownReached?: boolean }).verifierMousedownReached === true)
      if (reached) return { selected: false, attempts, detail: 'the click reached the locked block but did not select it' }
      lastFailure = 'the click did not reach the locked block'
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error)
    }
  }
  let selection = 'unavailable'
  try {
    selection = await describeSelection()
  } catch (error) {
    selection = `could not read current selection: ${error instanceof Error ? error.message : String(error)}`
  }
  return { selected: false, attempts: 3, detail: `${lastFailure}; current selection: ${selection}` }
}
