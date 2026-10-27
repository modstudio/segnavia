import { FontCssRefusedError, fontCss } from '@segnavia/html'
import { RenderRefusedError } from './errors.ts'
import type { Font } from './options.ts'

export function fontFaces(fonts: Font[] = []): string {
  try {
    return fontCss({ app: new Map(), local: fonts })
  } catch (error) {
    if (error instanceof FontCssRefusedError) throw new RenderRefusedError(error.message)
    throw error
  }
}
