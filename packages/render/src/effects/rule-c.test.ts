import { expect, test } from 'bun:test'
import { PDFDocument } from 'pdf-lib'
import type { ContentBudget } from '../press/pdf-objects.ts'
import { buildRuleCImage } from './rule-c.ts'

test('charges Rule C coverage work before evaluating samples', async () => {
  const document = await PDFDocument.create()
  const budget: ContentBudget = { decodedBytes: 0 }
  let chargedBeforeEvaluation = true
  const plan = {
    bbox: [0, 0, 10, 10],
    color: {
      axis: { start: { x: 0, y: 0 }, end: { x: 0, y: 10 } },
      channels: 3,
      evaluate: () => {
        chargedBeforeEvaluation &&= (budget.calculatorOperations ?? 0) > 0
        return [0, 0, 0]
      },
    },
    coverage: [{ kind: 'constant' as const, value: 1 }],
    masks: [],
  }

  expect(buildRuleCImage(document, plan, 1, budget, [1, 0, 0, 1, 0, 0])).toBeDefined()
  expect(budget.calculatorOperations).toBe(42)
  expect(chargedBeforeEvaluation).toBe(true)
})
