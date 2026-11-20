import { expect, test } from 'bun:test'
import { parseMergePdfsOptions } from './merge-pdf-options.ts'

test('requires merge metadata', () => {
  expect(() => parseMergePdfsOptions({} as never)).toThrow('mergePdfs metadata is required')
})
