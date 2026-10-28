import { describe, expect, test } from 'bun:test'
import { IDML_LIMITS, type IdmlLimits } from './limits.ts'
import { testZip } from './zip.test-helper.ts'
import { readZip } from './zip.ts'

const limits = (overrides: Partial<IdmlLimits>): IdmlLimits => ({ ...IDML_LIMITS, ...overrides })

describe('readZip', () => {
  test('reads stored and deflated entries', async () => {
    const bytes = await testZip([
      { name: 'stored', content: 'one' },
      { name: 'deflated', content: 'two'.repeat(100), method: 8 },
    ])
    const entries = await readZip(bytes)
    expect(entries.map((entry) => [entry.name, new TextDecoder().decode(entry.bytes)])).toEqual([
      ['stored', 'one'],
      ['deflated', 'two'.repeat(100)],
    ])
  })

  test('refuses every byte and count cap by name', async () => {
    const one = await testZip([{ name: 'one', content: '1234' }])
    const two = await testZip([
      { name: 'one', content: '1234' },
      { name: 'two', content: '5678' },
    ])
    await expect(readZip(one, limits({ packageBytes: one.byteLength - 1 }))).rejects.toThrow('package limit')
    await expect(readZip(one, limits({ entries: 0 }))).rejects.toThrow('entry count')
    await expect(readZip(one, limits({ partBytes: 3 }))).rejects.toThrow('per-part limit')
    await expect(readZip(two, limits({ totalInflatedBytes: 7 }))).rejects.toThrow('total inflated limit')
  })

  test('refuses encryption, other methods, ZIP64, and spanning disks by name', async () => {
    await expect(readZip(await testZip([{ name: 'secret', content: '', flags: 1 }]))).rejects.toThrow('encrypted')
    await expect(readZip(await testZip([{ name: 'odd', content: '', method: 9 }]))).rejects.toThrow('compression method 9')
    await expect(readZip(await testZip([{ name: 'large', content: '', declaredInflatedSize: 0xffff_ffff }]))).rejects.toThrow('ZIP64')
    await expect(readZip(await testZip([], { disk: 1 }))).rejects.toThrow('spanning disks')
  })

  test('names missing DecompressionStream at run time', async () => {
    const bytes = await testZip([{ name: 'deflated', content: 'text', method: 8 }])
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'DecompressionStream')
    Object.defineProperty(globalThis, 'DecompressionStream', { configurable: true, value: undefined })
    try {
      await expect(readZip(bytes)).rejects.toThrow('DecompressionStream is unavailable')
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'DecompressionStream', descriptor)
    }
  })

  test('refuses corrupt deflate data by entry name', async () => {
    const bytes = await testZip([{ name: 'broken.xml', content: 'content that needs its complete deflate stream', method: 8, truncateCompressedBytes: 2 }])
    await expect(readZip(bytes)).rejects.toThrow('ZIP entry broken.xml could not be inflated; export a complete IDML package to clear this refusal')
  })
})
