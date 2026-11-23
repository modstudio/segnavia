import { expect, test } from 'bun:test'
import type { FormsOption } from './bridge.ts'
import { definePlayerForwardedPropertyAccessors } from './player-forwarded-properties.ts'

test('a player forwards a form refusal to both its controller and its stage', () => {
  class Host {
    controller = { forms: undefined as FormsOption | undefined }
    stage = { forms: undefined as FormsOption | undefined }
  }
  definePlayerForwardedPropertyAccessors(Host.prototype)
  const player = new Host() as Host & { forms: FormsOption | undefined }
  player.forms = 'refuse'
  expect(player.controller.forms).toBe('refuse')
  expect(player.stage.forms).toBe('refuse')
})
