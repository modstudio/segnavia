import { describe, expect, test } from 'bun:test'
import { ABSOLUTE_PX, lengthPx, parseCssLength } from '@segnavia/html'
import { composerScript } from './book-composer.ts'

describe('composer region fit', () => {
  test('a smuggled CSS declaration is not fitted and cannot add a declaration', () => {
    const smuggled = '1px;background:url(https://example.invalid/x)'
    expect(parseCssLength(smuggled)).toBeUndefined()
    expect(lengthPx(smuggled, ABSOLUTE_PX)).toBeUndefined()
    const script = composerScript('{}')
    expect(script).not.toMatch(/font-size:'\+/)
    expect(script).toContain('lengthPx(minAttr,ABSOLUTE_PX)')
    expect(script).toContain('if(min===undefined||step===undefined)return')
  })
})
