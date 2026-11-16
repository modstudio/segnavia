import { expect, test } from 'bun:test'
import { composerScript, selectedPageRefusal } from './composer.ts'
import { dressPlanPagesImplementation } from './composer-dress.ts'

test('keeps the selected page folio and refuses a selection beyond the composed plan before dressing it', async () => {
  const script = composerScript('{}')
  const prepareStart = script.indexOf('var preparePlan=function')
  const prepareEnd = script.indexOf('\nvar prepared=preparePlan', prepareStart)
  const preparePlan = (only: number, failures: string[]) =>
    new Function(
      'config',
      'applyPrintedRules',
      'selectedPageRefusal',
      'fail',
      'planFolios',
      'setComposedHeight',
      'document',
      `${script.slice(prepareStart, prepareEnd)};return preparePlan`,
    )(
      { only, limit: 10, expectedCount: null },
      (plan: unknown) => plan,
      selectedPageRefusal,
      (reason: string) => failures.push(reason),
      undefined,
      () => {},
      { documentElement: { setAttribute: () => {} } },
    ) as (plan: unknown) => { pages: string[]; folios: string[] } | null
  const plan = { pages: ['first', 'second', 'third'], folios: ['1', '2', '3'] }
  const failures: string[] = []
  const prepared = preparePlan(2, failures)(plan)
  const selected: Array<{ page: string; folio: string }> = []
  await dressPlanPagesImplementation(
    prepared ?? { pages: [] },
    2,
    () => {},
    (_pages, page, index) => selected.push({ page, folio: prepared?.folios[index] ?? '' }),
    () => ({ setAttribute: () => {} }),
    () => 0,
    async () => {},
    false,
  )
  expect(failures).toEqual([])
  expect(selected).toEqual([{ page: 'second', folio: '2' }])

  expect(preparePlan(4, failures)(plan)).toBeNull()
  expect(failures).toEqual(["page 4 is beyond the composed run's 3 pages; pass a page from 1 through 3 to clear this refusal"])
})

test.each([0, -1, 1.5])('refuses invalid selected page %p within the composed plan bound', (only) => {
  expect(selectedPageRefusal(only, 3)).toBe(`page ${only} is outside the composed run's 3 pages; pass a page from 1 through 3 to clear this refusal`)
})
