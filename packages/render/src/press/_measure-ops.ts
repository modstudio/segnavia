import { PDFArray, PDFDocument, PDFName, PDFNumber } from 'pdf-lib'
import { applyOperator, pushStack } from './calculator-ops.ts'
import { evaluateCalculator, MAX_CALCULATOR_OPERATORS, parseCalculator } from './calculator.ts'

const CONIC = `{exch atan 360 div
dup 0 le {pop 1 0 0 0} if
dup dup 0 gt exch 1 le and {
dup .5 le {
dup .166666672 le {
0 sub 1 exch 6 mul 0 
}{
dup .33333334 le {
.166666672 sub -6 mul 1 add 1 0 
}{
.33333334 sub 0 exch 1 exch 6.0000005 mul 
} ifelse
} ifelse
}{
dup .66666669 le {
.5 sub 0 exch -5.9999995 mul 1 add 1 
}{
dup .83333331 le {
.66666669 sub 6.0000014 mul 0 1 
}{
.83333331 sub 1 exch 0 exch -5.9999995 mul 1 add 
} ifelse
} ifelse
} ifelse
0} if
0 gt {1 0 0} if
}`
const LINEAR = `{pop
dup truncate sub
dup 0 le {1 add} if
dup 0 le {pop .8784 .1882 .1882 0} if
dup dup 0 gt exch 1 le and {
dup .5 le {
0 sub pop .8784 .1882 .1882 
}{
.5 sub pop .1882 .1882 .8784 
} ifelse
0} if
0 gt {.1882 .1882 .8784} if
}`

function countOps(body: { kind: string; body?: unknown[] }[]): number {
  let n = 0
  for (const token of body) {
    if (token.kind === 'operator') n++
    else if (token.kind === 'procedure') n += countOps(token.body as { kind: string; body?: unknown[] }[])
  }
  return n
}

function run(program: ReturnType<typeof parseCalculator>, inputs: number[]): number {
  const state = { count: 0, stack: [] as never[] }
  const exec = (body: typeof program) => {
    for (const token of body) {
      if (token.kind === 'number') {
        pushStack(state, { kind: 'n', value: token.value, int: token.int })
        continue
      }
      if (token.kind === 'procedure') {
        pushStack(state, { kind: 'p', body: token.body })
        continue
      }
      state.count++
      if (state.count > MAX_CALCULATOR_OPERATORS) throw new Error('cap')
      applyOperator(token.name, state, (inner) => exec(inner as typeof program))
    }
  }
  for (const value of inputs) pushStack(state, { kind: 'n', value, int: Number.isInteger(value) })
  exec(program)
  return state.count
}

const conic = parseCalculator(CONIC)
const linear = parseCalculator(LINEAR)
console.log('conic AST operators', countOps(conic))
console.log('linear AST operators', countOps(linear))
const points = [
  [0, 0],
  [50, 0],
  [0, 50],
  [-50, 0],
  [0, -50],
  [10, 10],
  [1, 0],
  [100, 0],
  [-100, 100],
]
console.log(
  'conic executed',
  points.map((point) => [point.join(','), run(conic, point)]),
)
console.log(
  'linear executed',
  [
    [0, 0],
    [0.25, 0],
    [0.5, 0],
    [1, 0],
    [14, 0],
  ].map((point) => [point.join(','), run(linear, point)]),
)

const t0 = performance.now()
for (let i = 0; i < 100_000; i++) evaluateCalculator(conic, [50, 0])
const t1 = performance.now()
const ops = run(conic, [50, 0])
console.log('100k conic evals at [50,0] ms', (t1 - t0).toFixed(1), 'ops/eval', ops)
const samples = 390 * 240
console.log('one 260x160 conic samples', samples, 'ops', samples * ops, 'est ms', ((t1 - t0) / 100000) * samples)
console.log('eight conics samples', samples * 8, 'ops', samples * 8 * ops, 'est ms', ((t1 - t0) / 100000) * samples * 8)
const maxGrid = 1_048_576
console.log('one max grid ops', maxGrid * ops, 'est ms', ((t1 - t0) / 100000) * maxGrid)
console.log('eight max grids ops', maxGrid * 8 * ops, 'est ms', ((t1 - t0) / 100000) * maxGrid * 8)

const document = await PDFDocument.create()
try {
  const dict = document.context.obj({ Domain: [0, Number.POSITIVE_INFINITY, 0, 1] })
  const array = dict.lookup(PDFName.of('Domain'), PDFArray)
  console.log(
    'Infinity Domain',
    Array.from({ length: 4 }, (_, index) => array.lookup(index, PDFNumber).asNumber()),
  )
} catch (error) {
  console.log('Infinity Domain error', String(error))
}
try {
  console.log('PDFNumber Infinity', PDFNumber.of(Number.POSITIVE_INFINITY).asNumber())
} catch (error) {
  console.log('PDFNumber.of Infinity', String(error))
}
try {
  const dict = document.context.obj({ Domain: [0, 1e308, 0, 1] })
  const array = dict.lookup(PDFName.of('Domain'), PDFArray)
  console.log(
    '1e308 Domain',
    Array.from({ length: 4 }, (_, index) => array.lookup(index, PDFNumber).asNumber()),
  )
} catch (error) {
  console.log('1e308 Domain error', String(error))
}
