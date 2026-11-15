import { COMPOSER_CUSTOM_PROPERTY, HYPHENATE_CUSTOM_PROPERTY, type TextStyle, WORD_SPACING_CUSTOM_PROPERTY, type WordSpacing } from '@segnavia/format'

export interface CustomPropertyValues {
  getPropertyValue(name: string): string
}

export type CompositionStyle = Pick<TextStyle, 'composer' | 'wordSpacing' | 'hyphenate'>

function wordSpacing(value: string): WordSpacing | undefined {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/)
  if (!match) return undefined
  const [minimum, desired, maximum] = match.slice(1).map(Number)
  if (minimum === undefined || desired === undefined || maximum === undefined || minimum > desired || desired > maximum) return undefined
  return { minimum, desired, maximum }
}

export function readCompositionStyle(properties: CustomPropertyValues): CompositionStyle {
  const composerValue = properties.getPropertyValue(COMPOSER_CUSTOM_PROPERTY).trim()
  const spacingValue = wordSpacing(properties.getPropertyValue(WORD_SPACING_CUSTOM_PROPERTY))
  const hyphenateValue = properties.getPropertyValue(HYPHENATE_CUSTOM_PROPERTY).trim()
  return {
    ...(composerValue === 'paragraph' || composerValue === 'single-line' ? { composer: composerValue } : {}),
    ...(spacingValue ? { wordSpacing: spacingValue } : {}),
    ...(hyphenateValue === 'true' || hyphenateValue === 'false' ? { hyphenate: hyphenateValue === 'true' } : {}),
  }
}
