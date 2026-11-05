import { expect, test } from 'bun:test'
import type { ContentValue } from './content-value.ts'
import type { ResolvedContent } from './controller.ts'
import { FrameEntry } from './frame-entry.ts'

const options = { bridgeReadyTimeoutMs: 100, reportSlideError: () => {} }

function entry(content: ResolvedContent) {
  const value: ContentValue = { content, scripts: 'sandboxed', css: '', cspExtra: '', dependencyOrigins: '' }
  return new FrameEntry('slide', value, content)
}

test('a bridged frame becomes display-ready only after both load and ready', () => {
  for (const content of [
    { kind: 'html' as const, html: '<p>Slide</p>' },
    { kind: 'url' as const, src: 'slide.html', bridge: true as const },
  ]) {
    const frame = entry(content)
    let displayed = false
    frame.waitForDisplay(() => {
      displayed = true
    })

    frame.markLoaded(options)
    expect(frame.displayReady).toBeFalse()
    expect(displayed).toBeFalse()
    frame.markReady()
    expect(frame.displayReady).toBeTrue()
    expect(displayed).toBeTrue()
  }
})

test('an unbridged URL frame becomes display-ready when it loads', () => {
  const frame = entry({ kind: 'url', src: 'slide.html' })
  let displayed = false
  frame.waitForDisplay(() => {
    displayed = true
  })

  frame.markLoaded(options)

  expect(frame.displayReady).toBeTrue()
  expect(displayed).toBeTrue()
})
