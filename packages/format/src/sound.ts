import { z } from 'zod'
import { closedObject } from './closed-object.ts'
import { MediaText } from './media.ts'

export const SoundFormat = z.enum(['mp3', 'm4a', 'ogg', 'wav'])
export type SoundFormat = z.infer<typeof SoundFormat>

export const SOUND_FORMATS: Record<SoundFormat, { mime: string }> = {
  mp3: { mime: 'audio/mpeg' },
  m4a: { mime: 'audio/mp4' },
  ogg: { mime: 'audio/ogg' },
  wav: { mime: 'audio/wav' },
}

export const Sound = closedObject({
  format: SoundFormat,
  durationMs: z.number().positive(),
  title: MediaText.optional(),
  description: MediaText.optional(),
  caption: MediaText.optional(),
  credit: MediaText.optional(),
  image: z.string().min(1).optional(),
})
export type Sound = z.infer<typeof Sound>
export type SoundInput = z.input<typeof Sound>
