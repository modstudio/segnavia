import type { SegnaviaStage } from './stage.ts'

const READABLE_PROPERTIES = ['anchors', 'asOf', 'moment', 'transition'] as const
const WRITE_ONLY_PROPERTIES = ['css', 'cspExtra', 'origins', 'slots'] as const

type ForwardedProperty = (typeof READABLE_PROPERTIES)[number] | (typeof WRITE_ONLY_PROPERTIES)[number]

export type PlayerForwardedProperties = Pick<SegnaviaStage, ForwardedProperty>

interface PlayerForwardingHost {
  stage: SegnaviaStage
}

export function definePlayerForwardedPropertyAccessors(prototype: object): void {
  for (const property of READABLE_PROPERTIES) {
    Object.defineProperty(prototype, property, {
      configurable: true,
      get(this: PlayerForwardingHost) {
        return this.stage[property]
      },
      set(this: PlayerForwardingHost, value: SegnaviaStage[typeof property]) {
        Reflect.set(this.stage, property, value)
      },
    })
  }
  for (const property of WRITE_ONLY_PROPERTIES) {
    Object.defineProperty(prototype, property, {
      configurable: true,
      set(this: PlayerForwardingHost, value: SegnaviaStage[typeof property]) {
        Reflect.set(this.stage, property, value)
      },
    })
  }
}
