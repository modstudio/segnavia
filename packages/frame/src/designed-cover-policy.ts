import { Cover, type CoverInput, type Cover as CoverValue } from '@segnavia/format'

export interface DesignedCover {
  cover: CoverInput
  picture?: string
}

export type ParsedDesignedCover = { cover: CoverValue; picture?: string }
export type CoverPresentation = { kind: 'picture'; src: string } | { kind: 'live'; cover: CoverValue } | { kind: 'fallback' }

export const COVER_PREFERENCES = ['designed-picture', 'designed-live', 'fallback'] as const

const COVER_PRESENTERS: Record<(typeof COVER_PREFERENCES)[number], (designed: ParsedDesignedCover | undefined) => CoverPresentation | undefined> = {
  'designed-picture': (designed) => (designed?.picture ? { kind: 'picture', src: designed.picture } : undefined),
  'designed-live': (designed) => (designed ? { kind: 'live', cover: designed.cover } : undefined),
  fallback: () => ({ kind: 'fallback' }),
}

export function coverPresentation(designed: ParsedDesignedCover | undefined): CoverPresentation {
  for (const preference of COVER_PREFERENCES) {
    const presentation = COVER_PRESENTERS[preference](designed)
    if (presentation) return presentation
  }
  return { kind: 'fallback' }
}

export function parseDesignedCover(input: DesignedCover, subject: string): ParsedDesignedCover {
  try {
    return { ...input, cover: Cover.parse(input.cover) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${subject} has an invalid designedCover.cover: ${message}`)
  }
}
