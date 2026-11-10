import { expect, test } from 'bun:test'
import { regionBox } from '@segnavia/layout'
import { placeParentRegions } from './composer-regions.ts'

test('places an RTL block-start region with physical coordinates', () => {
  const appended: HTMLElement[] = []
  const attributes = new Map<string, string>()
  const furniture = { style: { cssText: '' } } as unknown as HTMLElement
  const held = {
    style: { cssText: '' },
    setAttribute(name: string, value: string) {
      attributes.set(name, value)
    },
    querySelectorAll: () => [furniture],
  } as unknown as HTMLElement

  placeParentRegions(
    { append: (child: HTMLElement) => appended.push(child) } as unknown as HTMLElement,
    {
      name: 'body',
      margin: { blockStart: 10, blockEnd: 10, inlineStart: 30, inlineEnd: 40 },
      textArea: { width: 100, height: 200 },
      regions: { head: { edge: 'blockStart', html: '<p>Head</p>' } },
    },
    { face: 'recto', side: 'left', flow: 'body' },
    { direction: 'rtl' },
    regionBox,
    () => ({}),
    () => {},
    () => held,
  )

  expect(appended).toEqual([held])
  expect(held.style.cssText).toBe('position:absolute;overflow:hidden;top:0px;left:40px;width:100px;height:10px')
  expect(attributes.get('data-segnavia-edge')).toBe('blockStart')
  expect(furniture.style.cssText).toContain('justify-content:flex-start')
})
