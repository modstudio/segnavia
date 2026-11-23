import { expect, test } from 'bun:test'

test('changing the controller serving seam drops mounted rail previews for remount', async () => {
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement')
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: class extends EventTarget {} })
  const { refreshRailPreviews } = await import('./rail.ts')
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
  if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement)
  else Reflect.deleteProperty(globalThis, 'HTMLElement')
})
