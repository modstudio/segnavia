import { expect, test } from 'bun:test'
import type { ResolvedContent } from './controller.ts'
import { stageSelectionRefusal } from './stage-selection.ts'

const html = { kind: 'html', html: '<p>Page</p>' } as const
const url = { kind: 'url', src: 'page.html' } as const

test('stage selection requires shown content and a mounted frame', () => {
  expect(stageSelectionRefusal(null, 'refuse', true)?.message).toContain('no slide is shown')
  expect(stageSelectionRefusal(html, 'refuse', false)?.message).toContain('no frame is mounted')
})

test('stage selection accepts refused-script HTML and declared bridge urls', () => {
  expect(stageSelectionRefusal(html, 'refuse', true)).toBeNull()
  expect(stageSelectionRefusal({ ...url, bridge: true, scripts: 'refuse' }, 'sandboxed', true)).toBeNull()
})

test('stage selection refuses HTML whose author scripts run', () => {
  expect(stageSelectionRefusal(html, 'sandboxed', true)?.message).toContain('while author scripts run')
})

test('stage selection refuses undeclared host-served documents', () => {
  expect(stageSelectionRefusal(url, 'refuse', true)?.message).toContain('host-served document')
  expect(stageSelectionRefusal({ ...url, bridge: true }, 'refuse', true)?.message).toContain('host-served document')
  expect(stageSelectionRefusal({ ...url, scripts: 'refuse' }, 'refuse', true)?.message).toContain('host-served document')
})

test('stage selection refuses slides without a bridge', () => {
  const image = { kind: 'image', src: 'page.png', alt: '' } as ResolvedContent
  expect(stageSelectionRefusal(image, 'refuse', true)?.message).toContain('current slide has no bridge')
})
