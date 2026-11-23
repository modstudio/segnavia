import { expect, test } from 'bun:test'
import { refreshRailPreviews } from './rail.ts'

test('changing the controller serving seam drops mounted rail previews for remount', () => {
  let children = 1
  const preview = {
    dataset: { generation: '2' },
    replaceChildren() {
      children = 0
    },
  }
  const root = { querySelectorAll: () => [preview] } as unknown as ParentNode
  const previous = () => '/frames/old'
  const next = () => '/frames/new'

  refreshRailPreviews(root, previous, next)

  expect(children).toBe(0)
  expect(preview.dataset.generation).toBe('3')
})
