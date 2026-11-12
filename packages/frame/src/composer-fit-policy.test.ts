import { expect, test } from 'bun:test'
import { reduceFitGroups } from '@segnavia/layout'
import { type FitDecision, fitApplication, fitAxis, fitBounds, fitLimitEntry, fitMeasurements, reduceDocumentFits } from './composer-fit-policy.ts'

const authored = { size: 32, leading: 1.4, tracking: 0 }
const units = { size: 'px', leading: '', tracking: 'px' }

test('slot fitting checks both axes while authored copyfit defaults to block', () => {
  expect(fitAxis(null, true)).toBe('both')
  expect(fitAxis(null, false)).toBe('block')
  expect(fitAxis('inline', true)).toBe('inline')
})

test('builds candidate bounds from authored values and declared absolute units', () => {
  expect(fitBounds(['size', 'leading'], ['12pt', '1.1'], [], ['1pt', '0.05'], authored, { px: 1, pt: 4 / 3 })).toEqual({
    bounds: [
      { strategy: 'size', authored: 32, min: 16, max: 32, step: 4 / 3 },
      { strategy: 'leading', authored: 1.4, min: 1.1, max: 1.4, step: 0.05 },
    ],
    units,
  })
})

test('applies a fit decision as CSS values and marks only a smaller size as shrunk', () => {
  expect(fitApplication({ id: 'card', values: { size: 18, leading: 1.1, tracking: -0.2 }, authored, units })).toEqual({
    styles: { fontSize: '18px', lineHeight: '1.1', letterSpacing: '-0.2px' },
    shrunk: true,
  })
})

test('reduces groups across the document and emits one measurement per block id', () => {
  const decisions: FitDecision[] = Array.from({ length: 16 }, (_, index) => ({
    id: `card-${index + 1}`,
    group: 'flashcards',
    values: { ...authored, size: 30 - index },
    authored,
    units,
  }))
  decisions.push({ id: 'card-1', group: 'flashcards', values: { ...authored, size: 10 }, authored, units })
  const reduced = reduceDocumentFits(decisions, reduceFitGroups)
  expect(reduced.every((decision) => decision.values.size === 10)).toBe(true)
  expect(fitMeasurements(reduced)).toHaveLength(16)
})

test('fit-limit names the block, exhausted strategy, bound and excess in its refusal text', () => {
  expect(fitLimitEntry({ id: 'too-long', stopped: { strategy: 'leading', bound: 1, excess: 7.5 } })).toEqual({
    check: 'fit-limit',
    subject: 'too-long',
    message: 'Fit too-long exhausted leading at 1 with 7.5px excess; enlarge the fit box or lower the bound to clear it.',
  })
})
