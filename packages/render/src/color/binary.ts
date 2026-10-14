import { refuse } from './types.ts'

export interface TagBounds {
  end: number
  name: string
}

export function need(offset: number, length: number, bounds: TagBounds): void {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > bounds.end)
    refuse(`truncated ${bounds.name} tag`, `${bounds.name} tag structure contained within its declared size`)
}

export function signature(bytes: Uint8Array, offset: number, bounds: TagBounds = { end: bytes.length, name: 'profile' }): string {
  need(offset, 4, bounds)
  return String.fromCharCode(...bytes.subarray(offset, offset + 4))
}

export function u16(view: DataView, offset: number, bounds: TagBounds): number {
  need(offset, 2, bounds)
  return view.getUint16(offset, false)
}

export function u32(view: DataView, offset: number, bounds: TagBounds): number {
  need(offset, 4, bounds)
  return view.getUint32(offset, false)
}

export function fixed(view: DataView, offset: number, bounds: TagBounds): number {
  need(offset, 4, bounds)
  return view.getInt32(offset, false) / 65_536
}

export const align4 = (value: number): number => Math.ceil(value / 4) * 4
