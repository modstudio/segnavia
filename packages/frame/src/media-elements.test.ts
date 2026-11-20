import { expect, test } from 'bun:test'

const previous = new Map(['HTMLElement', 'document'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const))

class TestElement extends EventTarget {
  children: unknown[] = []
  part = { add() {} }
  style = {
    values: new Map<string, string>(),
    setProperty(name: string, value: string) {
      this.values.set(name, value)
    },
    removeProperty(name: string) {
      this.values.delete(name)
    },
  }
  append(...children: unknown[]) {
    this.children.push(...children)
  }
}

class TestAudio extends TestElement {
  currentTime = 0
  duration = Number.NaN
  ended = false
  muted = false
  paused = true
  preload = ''
  src = ''
  async play() {
    this.paused = false
    this.dispatchEvent(new Event('play'))
  }
  pause() {
    this.paused = true
    this.dispatchEvent(new Event('pause'))
  }
}

Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: TestElement })
const { SegnaviaImage, SegnaviaSound } = await import('./media-elements.ts')
const htmlElementDescriptor = previous.get('HTMLElement')
if (htmlElementDescriptor) Object.defineProperty(globalThis, 'HTMLElement', htmlElementDescriptor)
else Reflect.deleteProperty(globalThis, 'HTMLElement')

function withTestDocument<T>(run: () => T): T {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: (tag: string) => (tag === 'audio' ? new TestAudio() : Object.assign(new TestElement(), { alt: '', dir: '', src: '' })) },
  })
  try {
    return run()
  } finally {
    const descriptor = previous.get('document')
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor)
    else Reflect.deleteProperty(globalThis, 'document')
  }
}

test('the image viewer keeps the media extent and source', () => {
  withTestDocument(() => {
    const element = new SegnaviaImage()
    const style = new TestElement().style
    Object.defineProperty(element, 'style', { configurable: true, value: style })
    element.media = { format: 'png', size: { width: 1200, height: 600 }, alt: { text: 'Wide image' } }
    element.src = 'image.png'
    expect(style.values.get('--segnavia-media-aspect')).toBe('1200 / 600')
    expect(element.image).toMatchObject({ src: 'image.png', alt: 'Wide image' })
  })
})

test('the sound playback follows its preload-none audio element for play, pause, seek, time and mute', async () => {
  const element = withTestDocument(() => new SegnaviaSound())
  const audio = element.audio as unknown as TestAudio
  element.sound = { format: 'mp3', durationMs: 90_000 }
  element.src = 'sound.mp3'
  expect(audio.preload).toBe('none')
  expect(audio.src).toBe('sound.mp3')
  await element.controller.play()
  expect(element.controller.state.playing).toBeTrue()
  await element.controller.seek(45_000)
  expect(audio.currentTime).toBe(45)
  expect(element.controller.state.elapsedMs).toBe(45_000)
  element.controller.setMuted(true)
  expect(element.controller.state.muted).toBeTrue()
  element.controller.pause()
  expect(element.controller.state.playing).toBeFalse()
})
