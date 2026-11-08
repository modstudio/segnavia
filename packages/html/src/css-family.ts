const CSS_GENERIC_FAMILY = /^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i
const CSS_IDENTIFIER_FAMILY = /^[-_a-z][-_a-z0-9]*$/i

interface QuoteFamilyOptions {
  quote: 'always' | 'when-needed'
  controlCharacter: 'escape' | ((family: string) => never)
}

// Family names enter style elements, where markup characters and controls
// need CSS escapes even though the surrounding HTML is already assembled.
export function quoteFamily(family: string, options: QuoteFamilyOptions): string {
  if (options.quote === 'when-needed' && (CSS_GENERIC_FAMILY.test(family) || CSS_IDENTIFIER_FAMILY.test(family))) return family
  let quoted = '"'
  for (const character of family) {
    const code = character.charCodeAt(0)
    if (character === '\\' || character === '"') quoted += `\\${character}`
    else if (character === '<') quoted += '\\3c '
    else if (code <= 0x1f || code === 0x7f) {
      if (options.controlCharacter !== 'escape') options.controlCharacter(family)
      quoted += `\\${code.toString(16)} `
    } else quoted += character
  }
  return `${quoted}"`
}
