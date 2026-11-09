import { expect, test } from 'bun:test'
import { Imposition, impose, sharedImpositionPress } from './index.ts'

test('refuses the first piece whose bleed or safe differs', () => {
  expect(() => sharedImpositionPress([{ print: { bleed: 0, safe: 2 } }, { print: { bleed: 5, safe: 2 } }])).toThrow(
    'piece 2 has print.bleed 5mm but piece 1 has 0mm; pieces on one imposition share one bleed and one safe; give the pieces one print.bleed, or print them without imposition, to clear this refusal',
  )
  expect(() => sharedImpositionPress([{ print: { bleed: 1, safe: 2 } }, { print: { bleed: 1, safe: 3 } }])).toThrow('piece 2 has print.safe 3mm')
  expect(sharedImpositionPress([{ print: { bleed: 1, safe: 2 } }, { print: { bleed: 1, safe: 2 } }])).toEqual({ bleed: 1, safe: 2 })
})

test('safe must leave area inside an imposition cell', () => {
  const imposition = Imposition.parse({ paper: 'a4', columns: 2, rows: 2, cell: { width: 80, height: 120 } })
  expect(() => impose(imposition, 1, { safe: 40 })).toThrow(
    'safe is 40mm on the left and right, but the cell is 80mm wide; safe must leave area inside the cell',
  )
})
