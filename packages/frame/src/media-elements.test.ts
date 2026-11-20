import { expect, test } from 'bun:test'

const previous = new Map(['HTMLElement', 'document'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const))

class TestElement extends EventTarget {
  children: unknown[] = []
  parentNode: TestElement | null = null
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
    for (const child of children) if (child instanceof TestElement) child.parentNode = this
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
    value: { createElement: (tag: string) => (tag === 'audio' ? new TestAudio() : Object.assign(new TestElement(), { alt: '', dir: '', lang: '', src: '' })) },
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
    element.media = { format: 'png', size: { width: 1200, height: 600 }, alt: { text: 'Wide image', lang: 'he' } }
    element.src = 'image.png'
    expect(style.values.get('--segnavia-media-aspect')).toBe('1200 / 600')
    expect(element.image).toMatchObject({ src: 'image.png', alt: 'Wide image', dir: 'rtl', lang: 'he' })
  })
})

test('the media viewers add their light DOM child only on first connection', () => {
  withTestDocument(() => {
    const image = new SegnaviaImage()
    const sound = new SegnaviaSound()
    expect(image.image.parentNode).not.toBe(image)
    expect(sound.audio.parentNode).not.toBe(sound)
    expect(sound.controller.state.playable).toBeFalse()
    const imageChildren: unknown[] = []
    const soundChildren: unknown[] = []
    Object.defineProperty(image, 'append', {
      value(child: TestElement) {
        imageChildren.push(child)
        child.parentNode = image as unknown as TestElement
      },
    })
    Object.defineProperty(sound, 'append', {
      value(child: TestElement) {
        soundChildren.push(child)
        child.parentNode = sound as unknown as TestElement
      },
    })
    image.connectedCallback()
    sound.connectedCallback()
    image.connectedCallback()
    sound.connectedCallback()
    expect(imageChildren).toEqual([image.image])
    expect(soundChildren).toEqual([sound.audio])
  })
})

test('sound playback rereads state and preserves a play rejection', async () => {
  const element = withTestDocument(() => new SegnaviaSound())
  const audio = element.audio as unknown as TestAudio
  audio.currentTime = 12
  audio.duration = 30
  audio.play = async () => {
    throw new Error('play refused')
  }
  await expect(element.controller.play()).rejects.toThrow('play refused')
  expect(element.controller.state.elapsedMs).toBe(12_000)
  expect(element.controller.state.totalMs).toBe(30_000)
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
