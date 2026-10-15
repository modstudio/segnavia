import { PDFArray, type PDFDict, type PDFDocument, PDFName, PDFNumber, type PDFObject, PDFRef } from 'pdf-lib'
import { dictionaryOf, numberOf } from '../press/pdf-objects.ts'

export const MAX_EFFECT_FUNCTION_DEPTH = 12
const MAX_EFFECT_FUNCTION_CHILDREN = 4096
const key = (name: string): PDFName => PDFName.of(name)
const resolved = (document: PDFDocument, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? document.context.lookup(object) : object

function numbers(dictionary: PDFDict, label: string): number[] | undefined {
  const array = dictionary.lookupMaybe(key(label), PDFArray)
  if (!array) return undefined
  const values: number[] = []
  for (let index = 0; index < array.size(); index++) {
    const value = array.lookupMaybe(index, PDFNumber)?.asNumber()
    if (value === undefined || !Number.isFinite(value)) return undefined
    values.push(value)
  }
  return values
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value))

export function functionEvaluator(
  document: PDFDocument,
  object: PDFObject | undefined,
  channels: number,
  path = new WeakSet<PDFDict>(),
  depth = 0,
): ((input: number) => number[]) | undefined {
  const fn = dictionaryOf(resolved(document, object))
  if (!fn || depth > MAX_EFFECT_FUNCTION_DEPTH || path.has(fn)) return undefined
  const type = numberOf(fn, 'FunctionType')
  const domain = numbers(fn, 'Domain') ?? [0, 1]
  if (domain.length !== 2 || domain[0] === domain[1]) return undefined
  if (type === 2) {
    const from = numbers(fn, 'C0') ?? [0]
    const to = numbers(fn, 'C1') ?? [1]
    const exponent = numberOf(fn, 'N')
    if (from.length !== channels || to.length !== channels || exponent === undefined) return undefined
    return (input) => {
      const value = clamp((input - (domain[0] ?? 0)) / ((domain[1] ?? 1) - (domain[0] ?? 0))) ** exponent
      return from.map((start, index) => start + ((to[index] ?? start) - start) * value)
    }
  }
  if (type !== 3) return undefined
  const functions = fn.lookupMaybe(key('Functions'), PDFArray)
  const bounds = numbers(fn, 'Bounds') ?? []
  const encode = numbers(fn, 'Encode') ?? []
  if (!functions || functions.size() > MAX_EFFECT_FUNCTION_CHILDREN || functions.size() !== bounds.length + 1 || encode.length !== functions.size() * 2)
    return undefined
  path.add(fn)
  const children: Array<((input: number) => number[]) | undefined> = []
  for (let index = 0; index < functions.size(); index++) children.push(functionEvaluator(document, functions.get(index), channels, path, depth + 1))
  path.delete(fn)
  if (children.some((child) => !child)) return undefined
  return (input) => {
    const value = Math.max(domain[0] ?? 0, Math.min(domain[1] ?? 1, input))
    let index = bounds.findIndex((bound) => value < bound)
    if (index < 0) index = bounds.length
    const low = index === 0 ? (domain[0] ?? 0) : (bounds[index - 1] ?? 0)
    const high = index === bounds.length ? (domain[1] ?? 1) : (bounds[index] ?? 1)
    const encodedLow = encode[index * 2] ?? 0
    const encodedHigh = encode[index * 2 + 1] ?? 1
    const mapped = high === low ? encodedLow : encodedLow + ((value - low) / (high - low)) * (encodedHigh - encodedLow)
    return (children[index] as (input: number) => number[])(mapped)
  }
}
