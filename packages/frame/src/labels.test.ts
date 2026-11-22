import { expect, test } from 'bun:test'
import { bookLabel, ENGLISH_LABELS, type PlayerLabels, playerLabels } from './labels.ts'

test('labels added after a host translation fall back to English', () => {
  const oldLabels: Partial<PlayerLabels> = {
    play: 'הפעלה',
    pause: 'השהיה',
    previous: 'השקופית הקודמת',
    next: 'השקופית הבאה',
  }

  const labels = playerLabels(oldLabels)

  expect(labels.play).toBe('הפעלה')
  expect(labels.time('0:12', '0:40')).toBe(ENGLISH_LABELS.time('0:12', '0:40'))
  expect(labels.mute).toBe(ENGLISH_LABELS.mute)
  expect(ENGLISH_LABELS.noSpeakerNotes).toBe('No speaker notes')
  expect(labels.noSpeakerNotes).toBe(ENGLISH_LABELS.noSpeakerNotes)
  expect(labels.itemSettings).toBe('Item settings')
  expect(labels.noSettingsForSlide).toBe('No settings for this slide')
})

test('the unnamed book label follows English and Hebrew', () => {
  expect(bookLabel(undefined)).toBe('Book')
  expect(bookLabel('en')).toBe('Book')
  expect(bookLabel('he-IL')).toBe('ספר')
})

test('slide labels include an isolated title and keep the untitled form', () => {
  expect(ENGLISH_LABELS.slide(3, 12)).toBe('Slide 3 of 12')
  expect(ENGLISH_LABELS.slide(3, 12, 'Intro')).toBe('\u2068Intro\u2069, slide 3 of 12')
  expect(ENGLISH_LABELS.slide(3, 12, 'מבוא')).toBe('\u2068מבוא\u2069, slide 3 of 12')
})

test('a host slide label that accepts two arguments keeps working', () => {
  const labels = playerLabels({ slide: (number, total) => `${number}/${total}` })
  expect(labels.slide(3, 12, 'Intro')).toBe('3/12')
})
