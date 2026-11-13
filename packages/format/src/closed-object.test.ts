import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import { closedObject, renderIssuePath } from './closed-object.ts'

describe('renderIssuePath', () => {
  test('renders names and array indexes', () => expect(renderIssuePath(['children', 2, 'geometry', 'margin'])).toBe('children[2].geometry.margin'))
})

describe('closedObject', () => {
  test('names the full path and unknown key', () => {
    const schema = closedObject({ children: z.array(closedObject({ title: z.string() })) })
    expect(schema.safeParse({ children: [{ title: 'One' }, { title: 'Two', contentsDepth: 2 }] }).error?.issues[0]?.message).toBe(
      'children[1].contentsDepth: unknown key "contentsDepth"; the model does not define it here; remove it to clear this refusal',
    )
  })

  test('reports several unknown keys in one issue', () => {
    const result = closedObject({ title: z.string() }).safeParse({ title: 'One', number: 1, contentsLabel: 'Part' })
    expect(result.error?.issues).toHaveLength(1)
    expect(result.error?.issues[0]?.message).toBe(
      'unknown keys "number", "contentsLabel"; the model does not define them here; remove them to clear this refusal',
    )
  })

  test('directs parent page margin to its defined home', () => {
    const schema = closedObject({ parentPages: z.array(closedObject({ geometry: closedObject({}) })) })
    expect(schema.safeParse({ parentPages: [{ geometry: {}, margin: 12 }] }).error?.issues[0]?.message).toBe(
      'parentPages[0].margin: unknown key "margin"; the model does not define it here; move it to geometry.margin to clear this refusal',
    )
  })
})
