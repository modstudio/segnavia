const COMPOSERS: Readonly<Record<string, string>> = {
  '$ID/HL Composer Optyca': 'paragraph',
  '$ID/Adobe Paragraph Composer': 'paragraph',
  'Adobe Paragraph Composer': 'paragraph',
  '$ID/HL Single Optyca': 'single-line',
  '$ID/Adobe Single-line Composer': 'single-line',
  'Adobe Single-line Composer': 'single-line',
}

export function compositionStyleDeclarations(values: Record<string, string>, mapped: ReadonlySet<string>): string[] {
  const output: string[] = []
  const composer = mapped.has('Composer') ? COMPOSERS[values.Composer ?? ''] : undefined
  if (composer) output.push(`--segnavia-composer:${composer}`)
  if (['MinimumWordSpacing', 'DesiredWordSpacing', 'MaximumWordSpacing'].every((name) => mapped.has(name))) {
    const [minimum, desired, maximum] = [values.MinimumWordSpacing, values.DesiredWordSpacing, values.MaximumWordSpacing].map(Number)
    if (
      minimum !== undefined &&
      desired !== undefined &&
      maximum !== undefined &&
      Number.isFinite(minimum) &&
      Number.isFinite(desired) &&
      Number.isFinite(maximum) &&
      minimum >= 0 &&
      minimum <= desired &&
      desired <= maximum
    ) {
      const spacing = [minimum, desired, maximum]
      output.push(`--segnavia-word-spacing:${spacing.map((value) => `${value}%`).join(' ')}`)
    }
  }
  if (mapped.has('Hyphenation') && (values.Hyphenation === 'true' || values.Hyphenation === 'false')) {
    output.push(`--segnavia-hyphenate:${values.Hyphenation}`)
  }
  return output
}
