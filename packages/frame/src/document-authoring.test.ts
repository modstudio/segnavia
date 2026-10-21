import { describe, expect, test } from 'bun:test'
import { Page } from '@segnavia/format'

class ElementStub extends EventTarget {}
Object.assign(globalThis, {
  HTMLElement: ElementStub,
  customElements: {
    define() {},
    get: () => undefined,
  },
})

const { DocumentAuthoringController } = await import('./document-authoring.ts')
type DocumentAuthoringControllerInstance = InstanceType<typeof DocumentAuthoringController>

function heldController(outcome: 'resolve' | 'reject') {
  let settle = () => {}
  const pages = ['a', 'b'].map((id) => Page.parse({ id, html: id }))
  const railCalls: unknown[] = []
  const document = Object.assign(new EventTarget(), {
    pages,
    print: null,
    css: '',
    setAuthoringRail: (rail: unknown) => railCalls.push(rail),
    scrollToPage() {},
  })
  const rail = {
    setReorderEnabled() {},
    configure() {},
  }
  const pending = new Promise<void>((resolve, reject) => {
    settle = outcome === 'resolve' ? resolve : () => reject(new Error('No'))
  })
  const controller = Reflect.construct(EventTarget, [], DocumentAuthoringController) as DocumentAuthoringControllerInstance
  Object.assign(controller, {
    document,
    handlers: { movePage: () => pending },
    rail,
    unsubscribe: () => {},
    pending: false,
    stopped: false,
    identityError: null,
  })
  return { controller, document, railCalls, settle }
}

describe('document authoring detach during reorder', () => {
  for (const outcome of ['resolve', 'reject'] as const) {
    test(`does not reinstall the rail or emit completion events after ${outcome}`, async () => {
      const { controller, document, railCalls, settle } = heldController(outcome)
      const dirty: boolean[] = []
      const errors: unknown[] = []
      controller.addEventListener('dirty-change', (event: Event) => dirty.push((event as CustomEvent<{ dirty: boolean }>).detail.dirty))
      controller.addEventListener('authoring-error', (event: Event) => errors.push((event as CustomEvent).detail))

      const moving = (controller as unknown as { move(fromIndex: number, toIndex: number): Promise<void> }).move(0, 1)
      controller.detach()
      settle()
      await moving

      expect(railCalls.at(-1)).toBeNull()
      expect(dirty).toEqual([true])
      expect(errors).toEqual([])
      expect(document.pages.map((page) => page.id)).toEqual(outcome === 'resolve' ? ['b', 'a'] : ['a', 'b'])
    })
  }
})
