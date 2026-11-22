import { expect, test } from 'bun:test'
import { Slide } from './deck.ts'

const slide = (title?: string, extra: Record<string, unknown> = {}) => ({
  id: 'opening',
  ...(title === undefined ? {} : { title }),
  content: { kind: 'html' as const, html: '<h1>Opening</h1>' },
  ...extra,
})

test('a slide keeps an optional title with visible text', () => {
  expect(Slide.parse(slide('Intro')).title).toBe('Intro')
  expect(Slide.parse(slide())).not.toHaveProperty('title')
})

test('a slide refuses an empty title and says how to clear it', () => {
  const refusal = 'a slide title needs visible text; give it text or remove title to clear this refusal'
  expect(() => Slide.parse(slide(''))).toThrow(refusal)
  expect(() => Slide.parse(slide('  '))).toThrow(refusal)
})

test('a slide still refuses another unknown key', () => {
  const result = Slide.safeParse(slide('Intro', { future: true }))
  expect(result.success).toBeFalse()
  if (!result.success) expect(result.error.issues[0]?.message).toContain('unknown key "future"')
})
