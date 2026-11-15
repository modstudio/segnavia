import {
  COMPOSER_CUSTOM_PROPERTY,
  COMPOSER_VALUES,
  HYPHENATE_CUSTOM_PROPERTY,
  parseWordSpacing,
  type TextStyle,
  WORD_SPACING_CUSTOM_PROPERTY,
} from '@segnavia/format'

export interface CustomPropertyValues {
  getPropertyValue(name: string): string
}

export type CompositionStyle = Pick<TextStyle, 'composer' | 'wordSpacing' | 'hyphenate'>

export function readCompositionStyle(properties: CustomPropertyValues): CompositionStyle {
  const composerValue = properties.getPropertyValue(COMPOSER_CUSTOM_PROPERTY).trim()
  const spacingValue = parseWordSpacing(properties.getPropertyValue(WORD_SPACING_CUSTOM_PROPERTY))
  const hyphenateValue = properties.getPropertyValue(HYPHENATE_CUSTOM_PROPERTY).trim()
  return {
    ...(COMPOSER_VALUES.some((value) => value === composerValue) ? { composer: composerValue as TextStyle['composer'] } : {}),
    ...(spacingValue ? { wordSpacing: spacingValue } : {}),
    ...(hyphenateValue === 'true' || hyphenateValue === 'false' ? { hyphenate: hyphenateValue === 'true' } : {}),
  }
}
