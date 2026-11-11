import type { SegnaviaStage } from './stage.ts'

interface PlayerAsOfHost {
  stage: SegnaviaStage
}

export function definePlayerAsOfPropertyAccessors(prototype: object): void {
  for (const property of ['anchors', 'asOf', 'moment'] as const) {
    Object.defineProperty(prototype, property, {
      configurable: true,
      get(this: PlayerAsOfHost) {
        return this.stage[property]
      },
      set(this: PlayerAsOfHost, value: SegnaviaStage[typeof property]) {
        Reflect.set(this.stage, property, value)
      },
    })
  }
}
