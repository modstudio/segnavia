import { expect, test } from 'bun:test'
import { Refusal } from '@segnavia/format'
import { connectPlayerRefusal, type PlayerRefusalStage } from './player-refusal.ts'

test('a stage refusal change updates the player refusal component', () => {
  const stage = new EventTarget() as PlayerRefusalStage & { refusal: Refusal | null }
  const component = { refusal: null as Refusal | null }
  const root = { querySelector: () => component } as unknown as ShadowRoot
  connectPlayerRefusal(root, stage)

  const refusal = new Refusal('slide', 'refused')
  stage.refusal = refusal
  stage.dispatchEvent(new CustomEvent('refusalchange'))
  expect(component.refusal).toBe(refusal)

  stage.refusal = null
  stage.dispatchEvent(new CustomEvent('refusalchange'))
  expect(component.refusal).toBeNull()
})
