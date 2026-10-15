import { PDFArray, type PDFDict, type PDFDocument, PDFName, PDFNumber, type PDFObject, PDFRef } from 'pdf-lib'
import type { ContentOperation } from '../press/content.ts'
import { dictionaryOf, nameOf } from '../press/pdf-objects.ts'

export type EffectStructure = 'allowed' | 'other'

const key = (name: string): PDFName => PDFName.of(name)
const resolved = (document: PDFDocument, object: PDFObject | undefined): PDFObject | undefined =>
  object instanceof PDFRef ? document.context.lookup(object) : object

export interface EffectGraphicsState {
  dictionaries: PDFDict[]
  structure: EffectStructure
}

export const EMPTY_EFFECT_GRAPHICS_STATE: EffectGraphicsState = { dictionaries: [], structure: 'allowed' }

function finiteNumber(dictionary: PDFDict, label: string): number | undefined {
  const object = dictionary.get(key(label))
  const value = object instanceof PDFRef ? dictionary.context.lookup(object) : object
  const number = value instanceof PDFNumber ? value.asNumber() : undefined
  return number !== undefined && Number.isFinite(number) ? number : undefined
}

export function effectOpacity(graphicsState: PDFDict | undefined): number | undefined {
  if (!graphicsState?.has(key('ca'))) return 1
  return finiteNumber(graphicsState, 'ca')
}

export function effectGraphicsStateStructure(graphicsState: PDFDict | undefined): EffectStructure {
  if (!graphicsState) return 'allowed'
  for (const [name] of graphicsState.entries()) {
    const label = name.toString().slice(1)
    if (label === 'Type' || label === 'SMask') continue
    if (label === 'ca' && finiteNumber(graphicsState, label) !== undefined) continue
    if (label === 'CA' && finiteNumber(graphicsState, label) === 1) continue
    if (label === 'BM' && nameOf(graphicsState.lookup(key(label))) === 'Normal') continue
    return 'other'
  }
  return 'allowed'
}

export function advanceEffectGraphicsState(
  document: PDFDocument,
  operation: ContentOperation,
  states: PDFDict | undefined,
  current: EffectGraphicsState,
  stack: EffectGraphicsState[],
): EffectGraphicsState {
  if (operation.operator === 'q') {
    stack.push(current)
    return current
  }
  if (operation.operator === 'Q') return stack.pop() ?? EMPTY_EFFECT_GRAPHICS_STATE
  const operand = operation.operands[0]
  if (operation.operator !== 'gs') return current
  if (operation.operands.length !== 1 || operand?.kind !== 'name') return { ...current, structure: 'other' }
  const dictionary = dictionaryOf(resolved(document, states?.get(key(operand.raw.slice(1)))))
  if (!dictionary) return { ...current, structure: 'other' }
  return {
    dictionaries: [...current.dictionaries, dictionary],
    structure: current.structure === 'other' || effectGraphicsStateStructure(dictionary) === 'other' ? 'other' : 'allowed',
  }
}

export function effectGraphicsStateValue(state: EffectGraphicsState, label: string): PDFObject | undefined {
  for (let index = state.dictionaries.length - 1; index >= 0; index--) {
    const dictionary = state.dictionaries[index]
    if (dictionary?.has(key(label))) return dictionary.get(key(label))
  }
  return undefined
}

export function effectGraphicsStateOpacity(state: EffectGraphicsState): number | undefined {
  for (let index = state.dictionaries.length - 1; index >= 0; index--) {
    const dictionary = state.dictionaries[index]
    if (dictionary?.has(key('ca'))) return effectOpacity(dictionary)
  }
  return 1
}

export function effectFormStructure(form: PDFDict): EffectStructure {
  if (!form.has(key('Matrix'))) return 'allowed'
  const matrix = form.lookupMaybe(key('Matrix'), PDFArray)
  if (matrix?.size() !== 6) return 'other'
  const identity = [1, 0, 0, 1, 0, 0]
  for (let index = 0; index < identity.length; index++) {
    const value = matrix.lookupMaybe(index, PDFNumber)?.asNumber()
    if (value === undefined || !Number.isFinite(value) || Math.abs(value - (identity[index] ?? 0)) > 1e-9) return 'other'
  }
  return 'allowed'
}
