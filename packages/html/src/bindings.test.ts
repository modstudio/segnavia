import { describe, expect, test } from 'bun:test'
import { fill } from './bindings.ts'

const prefix = 'demo'

describe('bound href fetches', () => {
  test('an external image href is refused and reported unavailable', () => {
    const filled = fill('<svg><image data-demo-href="pic"/></svg>', {
      prefix,
      links: { protocols: ['https:'] },
      data: { pic: 'https://outside.example/b.png' },
    })
    expect(filled.html).toBe('<svg><image/></svg>')
    expect(filled.unavailable).toEqual(['pic'])
  })

  test('a bound same-document fetch is kept', () => {
    const filled = fill('<svg><use data-demo-href="symbol"/></svg>', {
      prefix,
      linkOrigins: ['https://inside.example'],
      data: { symbol: '#x' },
    })
    expect(filled.html).toBe('<svg><use href="#x"/></svg>')
    expect(filled.unavailable).toEqual([])
  })
})
