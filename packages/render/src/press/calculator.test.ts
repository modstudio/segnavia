import { expect, test } from 'bun:test'
import { evaluateCalculator, MAX_CALCULATOR_PROGRAM_BYTES, MAX_CALCULATOR_STACK, parseCalculator, staticOperatorCount } from './calculator.ts'
import { CONIC, REPEATING_LINEAR } from './sample-shading-fixtures.test-helper.ts'

const run = (source: string, inputs: number[] = []) => evaluateCalculator(parseCalculator(source), inputs)

test('arithmetic operators match hand-computed results', () => {
  expect(run('3 4 add')).toEqual([7])
  expect(run('3 4 sub')).toEqual([-1])
  expect(run('3 4 mul')).toEqual([12])
  expect(run('3 2 div')[0]).toBeCloseTo(1.5, 10)
  expect(run('7 3 idiv')).toEqual([2])
  expect(run('-7 3 idiv')).toEqual([-2])
  expect(run('7 3 mod')).toEqual([1])
  expect(run('-5 abs')).toEqual([5])
  expect(run('5 neg')).toEqual([-5])
  expect(run('2 3 exp')).toEqual([8])
  expect(run('8 sqrt')[0]).toBeCloseTo(Math.sqrt(8), 10)
  expect(run('1 ln')[0]).toBeCloseTo(0, 10)
  expect(run('100 log')[0]).toBeCloseTo(2, 10)
  expect(run('1.2 floor')).toEqual([1])
  expect(run('1.2 ceiling')).toEqual([2])
  expect(run('1.5 round')).toEqual([2])
  expect(run('-1.5 round')).toEqual([-2])
  expect(run('1.9 truncate')).toEqual([1])
  expect(run('-1.9 truncate')).toEqual([-1])
  expect(run('90 sin')[0]).toBeCloseTo(1, 10)
  expect(run('180 cos')[0]).toBeCloseTo(-1, 10)
  expect(run('1 1 atan')[0]).toBeCloseTo(45, 10)
  expect(run('0 0 atan')).toEqual([0])
  expect(run('0 -1 atan')[0]).toBeCloseTo(180, 10)
  expect(run('-1 0 atan')[0]).toBeCloseTo(270, 10)
  expect(run('-1 1 atan')[0]).toBeCloseTo(315, 10)
  expect(run('1.9 cvi')).toEqual([1])
  expect(run('2 cvr 2 div')[0]).toBeCloseTo(1, 10)
})

test('relational boolean and bitwise operators', () => {
  expect(run('3 4 lt { 1 } { 0 } ifelse')).toEqual([1])
  expect(run('4 4 le { 1 } { 0 } ifelse')).toEqual([1])
  expect(run('5 4 gt { 1 } { 0 } ifelse')).toEqual([1])
  expect(run('4 4 ge { 1 } { 0 } ifelse')).toEqual([1])
  expect(run('1 1 eq { 1 } { 0 } ifelse')).toEqual([1])
  expect(run('1 2 ne { 1 } { 0 } ifelse')).toEqual([1])
  expect(run('true false and { 1 } { 0 } ifelse')).toEqual([0])
  expect(run('true false or { 1 } { 0 } ifelse')).toEqual([1])
  expect(run('true false xor { 1 } { 0 } ifelse')).toEqual([1])
  expect(run('true not { 1 } { 0 } ifelse')).toEqual([0])
  expect(run('6 3 and')).toEqual([2])
  expect(run('6 3 or')).toEqual([7])
  expect(run('6 3 xor')).toEqual([5])
  expect(run('1 3 bitshift')).toEqual([8])
  expect(run('8 -2 bitshift')).toEqual([2])
  expect(run('-8 -1 bitshift')).toEqual([2147483644])
  expect(run('1 32 bitshift')).toEqual([0])
  expect(run('1 not')).toEqual([-2])
})

test('if executes the procedure only when the predicate is true', () => {
  expect(run('true { 9 } if')).toEqual([9])
  expect(run('false { 9 } if')).toEqual([])
})

test('ifelse takes the then procedure when the predicate is true', () => {
  expect(run('true { 1 } { 2 } ifelse')).toEqual([1])
  expect(run('false { 1 } { 2 } ifelse')).toEqual([2])
})

test('stack operators copy dup exch index pop roll', () => {
  expect(run('1 2 3 pop')).toEqual([1, 2])
  expect(run('1 2 exch')).toEqual([2, 1])
  expect(run('4 dup')).toEqual([4, 4])
  expect(run('1 2 2 copy')).toEqual([1, 2, 1, 2])
  expect(run('1 2 3 1 index')).toEqual([1, 2, 3, 2])
  expect(run('1 2 3 3 1 roll')).toEqual([3, 1, 2])
  expect(run('1 2 3 3 -1 roll')).toEqual([2, 3, 1])
})

test('the Chromium conic program at chosen points matches hand-computed RGB', () => {
  const red = run(CONIC, [100, 0])
  expect(red).toHaveLength(3)
  expect(red[0]).toBeCloseTo(1, 5)
  expect(red[1]).toBeCloseTo(0, 5)
  expect(red[2]).toBeCloseTo(0, 5)
  const yellow = run(CONIC, [50, 50 * Math.sqrt(3)])
  expect(yellow[0]).toBeCloseTo(1, 4)
  expect(yellow[1]).toBeCloseTo(1, 4)
  expect(yellow[2]).toBeCloseTo(0, 4)
  const limeAqua = run(CONIC, [0, 100])
  expect(limeAqua[0]).toBeCloseTo(0.5, 4)
  expect(limeAqua[1]).toBeCloseTo(1, 4)
  expect(limeAqua[2]).toBeCloseTo(0, 4)
  const blueMagenta = run(CONIC, [0, -100])
  expect(blueMagenta[0]).toBeCloseTo(0.5, 4)
  expect(blueMagenta[1]).toBeCloseTo(0, 4)
  expect(blueMagenta[2]).toBeCloseTo(1, 4)
})

test('the Chromium repeating-linear program at chosen points matches hand-computed RGB', () => {
  const first = run(REPEATING_LINEAR, [0.25, 0])
  expect(first[0]).toBeCloseTo(0.8784, 5)
  expect(first[1]).toBeCloseTo(0.1882, 5)
  expect(first[2]).toBeCloseTo(0.1882, 5)
  const second = run(REPEATING_LINEAR, [0.75, 3])
  expect(second[0]).toBeCloseTo(0.1882, 5)
  expect(second[1]).toBeCloseTo(0.1882, 5)
  expect(second[2]).toBeCloseTo(0.8784, 5)
  const seam = run(REPEATING_LINEAR, [0, 0])
  expect(seam[0]).toBeCloseTo(0.1882, 5)
  expect(seam[2]).toBeCloseTo(0.8784, 5)
})

test('staticOperatorCount includes both branches of if', () => {
  const heavy = Array.from({ length: 1000 }, () => 'dup pop').join(' ')
  expect(staticOperatorCount(parseCalculator(`{ pop dup 0.5 gt { ${heavy} } if 0 0 0 }`))).toBe(2004)
  expect(staticOperatorCount(parseCalculator(CONIC))).toBe(52)
})

test.each([
  ['loop', '1 2 loop', /calculator operator loop/],
  ['exec', '{ 1 } exec', /calculator operator exec/],
  ['string', '(hi)', /calculator token/],
  ['underflow', 'pop', /calculator pop stack underflow/],
  ['stack', `${'1 '.repeat(MAX_CALCULATOR_STACK + 1)}`, /calculator stack depth/],
  ['length', `${'1 '.repeat(MAX_CALCULATOR_PROGRAM_BYTES)}`, /calculator program length/],
])('refuses %s and names it', (_name, source, message) => {
  expect(() => run(source)).toThrow(message)
})
