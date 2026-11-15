import {
  COMPOSER_CUSTOM_PROPERTY,
  COMPOSER_VALUES,
  HYPHENATE_CUSTOM_PROPERTY,
  KEEP_WITH_CUSTOM_PROPERTY,
  parseWordSpacing,
  WORD_SPACING_CUSTOM_PROPERTY,
} from '@segnavia/format'
import { KEEP_WITH_VALUES } from './keep-with.ts'

interface LibraryCustomProperty {
  accepted: string
  accepts(value: string): boolean
}

export const LIBRARY_CUSTOM_PROPERTIES: Readonly<Record<string, LibraryCustomProperty>> = {
  [KEEP_WITH_CUSTOM_PROPERTY]: {
    accepted: 'next and previous',
    accepts: (value) => (KEEP_WITH_VALUES as readonly string[]).includes(value),
  },
  [COMPOSER_CUSTOM_PROPERTY]: {
    accepted: COMPOSER_VALUES.join(' and '),
    accepts: (value) => (COMPOSER_VALUES as readonly string[]).includes(value),
  },
  [HYPHENATE_CUSTOM_PROPERTY]: {
    accepted: 'true and false',
    accepts: (value) => value === 'true' || value === 'false',
  },
  [WORD_SPACING_CUSTOM_PROPERTY]: {
    accepted: 'three percentages in minimum desired maximum order, each from 0% to 1000% with at most two decimal places',
    accepts: (value) => parseWordSpacing(value) !== undefined,
  },
}

export function libraryCustomProperty(name: string): LibraryCustomProperty | undefined {
  return Object.hasOwn(LIBRARY_CUSTOM_PROPERTIES, name) ? LIBRARY_CUSTOM_PROPERTIES[name] : undefined
}
