import { type CompositionCustomProperties, readCompositionStyle, type TextStyle } from '@segnavia/format'

export type CustomPropertyValues = CompositionCustomProperties

export type CompositionStyle = Pick<TextStyle, 'composer' | 'wordSpacing' | 'hyphenate'>

export { readCompositionStyle }
