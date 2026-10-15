import { describe, expect, test } from 'bun:test'
import { containFixedPageOverflow } from './overflow-containment.ts'

describe('fixed-page overflow containment', () => {
  test('prepends root paint containment to host CSS', () => {
    expect(containFixedPageOverflow('body{margin:0}')).toBe(':where(:root){contain:paint;min-height:100%}body{margin:0}')
  })
})
