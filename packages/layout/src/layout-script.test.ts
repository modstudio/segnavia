import { expect, test } from 'bun:test'
import { layoutScript } from './layout-script.ts'
import { block, flow, input, settings } from './paginate-book.test-helper.ts'
import { planBook } from './plan-book.ts'
import { replayPlan, savePlan } from './plan-save.ts'
import { planPrintedPages } from './printed-pages.ts'

test('layoutScript evaluates in a bare scope and its planners match the module', () => {
  const embedded = new Function(`${layoutScript()};return {planBook,planPrintedPages,convergeLayout,savePlan,replayPlan}`)() as {
    planBook: typeof planBook
    planPrintedPages: typeof planPrintedPages
    convergeLayout: unknown
    savePlan: typeof savePlan
    replayPlan: typeof replayPlan
  }
  const measurements = input({
    flows: [flow('front', 'front', [block('text', 'p', 0, 1, 1, 0)], 'Front'), flow('body', 'chapter', [block('text', 'p', 1, 1, 1, 0)], 'Body')],
    settings: { ...settings, direction: 'rtl' },
  })
  const numbering = { frontMatter: 'hebrew' as const, body: 'hebrew' as const }
  expect(embedded.planBook(measurements, numbering)).toEqual(planBook(measurements, numbering))
  const planned = planBook(measurements, numbering)
  if (!planned.ok) throw new Error(planned.refusals[0]?.message)
  const saved = savePlan(measurements, planned.plan, numbering)
  expect(embedded.savePlan(measurements, planned.plan, numbering)).toEqual(saved)
  expect(embedded.replayPlan(measurements, saved, numbering)).toEqual(replayPlan(measurements, saved, numbering))
  const rules = { every: 'every', first: 'first', last: 'last', recto: 'recto', verso: 'verso' }
  expect(embedded.planPrintedPages(rules, 3, 'rtl', 'hebrew')).toEqual(planPrintedPages(rules, 3, 'rtl', 'hebrew'))
  expect(typeof embedded.convergeLayout).toBe('function')
})

test('layoutScript keeps its planner names after minification', async () => {
  const built = await Bun.build({
    entrypoints: ['virtual:layout-script'],
    minify: true,
    target: 'browser',
    conditions: ['@segnavia/source'],
    format: 'cjs',
    plugins: [
      {
        name: 'layout-script',
        setup(builder) {
          builder.onResolve({ filter: /^virtual:layout-script$/ }, () => ({ path: 'layout-script', namespace: 'virtual' }))
          builder.onLoad({ filter: /.*/, namespace: 'virtual' }, () => ({
            contents: `import { layoutScript } from ${JSON.stringify(`${import.meta.dir}/layout-script.ts`)}; export const script = layoutScript();`,
            loader: 'ts',
          }))
        },
      },
    ],
  })
  expect(built.success).toBe(true)
  const bundle = await built.outputs[0]?.text()
  expect(bundle).toBeDefined()
  const script = new Function('module', 'exports', `${bundle};return module.exports.script`)({ exports: {} }, {}) as string
  const embedded = new Function(`${script};return {planBook,planPrintedPages,bookPlanFolios,convergeLayout,savePlan,replayPlan}`)() as {
    planBook: typeof planBook
    planPrintedPages: typeof planPrintedPages
    bookPlanFolios: unknown
    convergeLayout: unknown
    savePlan: typeof savePlan
    replayPlan: typeof replayPlan
  }
  const measurements = input({
    flows: [flow('front', 'front', [block('text', 'p', 0, 1, 1, 0)], 'Front'), flow('body', 'chapter', [block('text', 'p', 1, 1, 1, 0)], 'Body')],
    settings: { ...settings, direction: 'rtl' },
  })
  const numbering = { frontMatter: 'hebrew' as const, body: 'hebrew' as const }
  expect(embedded.planBook(measurements, numbering)).toEqual(planBook(measurements, numbering))
  const planned = planBook(measurements, numbering)
  if (!planned.ok) throw new Error(planned.refusals[0]?.message)
  const saved = savePlan(measurements, planned.plan, numbering)
  expect(embedded.savePlan(measurements, planned.plan, numbering)).toEqual(saved)
  expect(embedded.replayPlan(measurements, saved, numbering)).toEqual(replayPlan(measurements, saved, numbering))
  const rules = { every: 'every', first: 'first', last: 'last', recto: 'recto', verso: 'verso' }
  expect(embedded.planPrintedPages(rules, 3, 'rtl', 'hebrew')).toEqual(planPrintedPages(rules, 3, 'rtl', 'hebrew'))
  expect(typeof embedded.bookPlanFolios).toBe('function')
  expect(typeof embedded.convergeLayout).toBe('function')
})
