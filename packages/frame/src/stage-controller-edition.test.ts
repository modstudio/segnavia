import { expect, test } from 'bun:test'
import { stageControllerEdition } from './stage-controller-edition.ts'

test('a stage only states an edition for an attached controller when it has the attribute', () => {
  expect(stageControllerEdition('teacher', undefined)).toEqual({ stated: false, edition: 'teacher' })
  expect(stageControllerEdition('teacher', 'student')).toEqual({ stated: true, edition: 'student' })
})
