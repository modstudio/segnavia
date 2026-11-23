import { FontCssRefusedError, fontCss } from '@segnavia/html'
import { RenderRefusedError } from './errors.ts'
import type { Font } from './options.ts'
import type { OriginApproval } from '@segnavia/format'

export function fontFaces(fonts: Font[] = [], origins?: Iterable<OriginApproval>): string {
  try {
    return fontCss({ app: new Map(), local: fonts, origins })
  } catch (error) {
    if (error instanceof FontCssRefusedError) throw new RenderRefusedError(error.message)
    throw error
  }
}
