import { expect, test } from 'bun:test'
import type { Measurements, Plan, ResolvedLineNumbers } from '@segnavia/format'
import { composerScript } from './composer.ts'
import { applyLineLabels, unsettledLineLabels } from './composer-line-labels.ts'

function lineLabelFixture(ids: string[]) {
  const numbers = new Map<string, { textContent: string; dir?: string }>()
  const labels = ids.map((id) => {
    const number: { textContent: string; dir?: string; setAttribute: (name: string, value: string) => void } = {
      textContent: '',
      setAttribute: (name: string, value: string) => {
        if (name === 'dir') number.dir = value
      },
    }
    numbers.set(id, number)
    return {
      getAttribute: (name: string) => (name === 'data-segnavia-line-label' ? id : name === 'data-segnavia-line-series' ? 'apparatus' : null),
      querySelector: (selector: string) => (selector === '[data-segnavia-line-label-number]' ? number : null),
    }
  })
  const doc = {
    querySelectorAll: (selector: string) => (selector === '[data-segnavia-galleys] [data-segnavia-line-label]' ? labels : []),
  } as unknown as Document
  return { doc, numbers }
}

function layoutFixture(): { measurements: Measurements; plan: Plan; settings: ResolvedLineNumbers } {
  const measurements = {
    flows: [
      {
        id: 'one',
        kind: 'chapter',
        blocks: [{ kind: 'text', position: { chapter: 1, block: 1 }, numbered: true, direction: 'ltr', lines: [{ top: 0, bottom: 10 }] }],
        lineNoteAnchors: [{ id: 'matched', top: 0, block: 1 }],
      },
    ],
  } as Measurements
  const plan = {
    pages: [{ windows: [{ flow: 'one', start: 0, end: 10, top: 0 }] }],
  } as Plan
  const settings = { interval: 1, start: 1, restart: 'never', area: 'text', side: 'outer', system: 'arabic' } as const
  return { measurements, plan, settings }
}

test('embeds line-label policy and fill only when a line-keyed series is configured', () => {
  const ordinary = composerScript('{}')
  const lineKeyed = composerScript('{"lineNoteSeries":[{"name":"apparatus","system":"arabic"}]}')
  expect(ordinary).not.toContain('var lineKeyedLabels=')
  expect(ordinary).not.toContain('function applyLineLabels')
  expect(ordinary).toContain("document.querySelector('[data-segnavia-line-label]')")
  expect(lineKeyed).toContain('var lineKeyedLabels=')
  expect(lineKeyed).toContain('function applyLineLabels')
  expect(lineKeyed).toContain('line-keyed note labels for ')
})

test('fills galley labels in their series system and reports unmatched labels', () => {
  const { measurements, plan, settings } = layoutFixture()
  const { doc, numbers } = lineLabelFixture(['matched', 'unmatched'])
  expect(applyLineLabels(measurements, plan, settings, [{ name: 'apparatus', system: 'hebrew' }], doc)).toEqual({ refusals: [], missing: ['unmatched'] })
  expect(numbers.get('matched')).toMatchObject({ textContent: 'א', dir: 'rtl' })
})

test('reports a label whose displayed value has not settled', () => {
  const { measurements, plan, settings } = layoutFixture()
  const { doc, numbers } = lineLabelFixture(['matched'])
  const number = numbers.get('matched')
  if (!number) throw new Error('The fixture has no matched label number.')
  number.textContent = '1'
  expect(unsettledLineLabels(measurements, plan, settings, [{ name: 'apparatus', system: 'hebrew' }], doc)).toEqual({ refusals: [], moved: ['matched'] })
})
