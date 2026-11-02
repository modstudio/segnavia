import { expect, test } from 'bun:test'
import { coverImage } from './cover-element.ts'

class TestImage extends EventTarget {
  src = ''
  alt = ''
  className = ''
  part = { add() {} }
}

test('a kept cover picture reports a load failure until its mount is disposed', () => {
  const image = new TestImage()
  const failures: unknown[] = []
  const mounted = coverImage(
    'kept.webp',
    (error) => failures.push(error),
    () => image as unknown as HTMLImageElement,
  )
  const failure = new Error('picture failed')
  image.dispatchEvent(Object.assign(new Event('error'), { error: failure }))
  expect(failures).toEqual([failure])
  mounted.dispose()
  image.dispatchEvent(Object.assign(new Event('error'), { error: new Error('later') }))
  expect(failures).toEqual([failure])
})
