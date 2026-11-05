import type { Harness } from './harness.ts'

type Locator = ReturnType<Harness['page']['locator']>

export async function selectStableLockedAtom(page: Harness['page'], atom: Locator, selected: Locator): Promise<{ selected: boolean; detail: string }> {
  const waitForStableBox = async () => {
    let previous = ''
    for (const deadline = Date.now() + 5000; Date.now() < deadline; await page.waitForTimeout(50)) {
      const box = await atom.boundingBox()
      const current = box ? JSON.stringify(box) : ''
      if (current && current === previous) return true
      previous = current
    }
    return false
  }
  for (let attempts = 1; attempts <= 3; attempts++) {
    if (!(await waitForStableBox())) return { selected: false, detail: `locked block bounding box did not stabilize before attempt ${attempts}` }
    await atom.click({ position: { x: 2, y: 2 } })
    await selected.waitFor({ timeout: 1000 }).catch(() => {})
    if ((await selected.count()) > 0) return { selected: true, detail: '' }
  }
  const selection = await page.evaluate(() => {
    const current = (
      document.getElementById('editor') as unknown as { richView: { state: { selection: { from: number; to: number; constructor: { name: string } } } } }
    ).richView.state.selection
    return `${current.constructor.name} ${current.from}-${current.to}`
  })
  return { selected: false, detail: `locked block never became selected after 3 attempts; current selection: ${selection}` }
}
