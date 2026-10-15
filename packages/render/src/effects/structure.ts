import { PDFArray, type PDFDict, PDFName, PDFNumber, PDFRef } from 'pdf-lib'
import { nameOf } from '../press/pdf-objects.ts'

export type EffectStructure = 'allowed' | 'other'

const key = (name: string): PDFName => PDFName.of(name)

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
