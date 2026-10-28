export interface IdmlFontUse {
  appliedFont: string
  fontStyle?: string
  locations: string[]
}

export interface IdmlReportData {
  unsupportedElements: Record<string, number>
  unsupportedStyleProperties: Record<string, number>
  unsupportedOverrideProperties: Record<string, number>
  unsupportedSpecialCharacters: Record<string, number>
  unsupportedLanguages: Record<string, number>
  spotColors: Record<string, number>
  locations: Record<string, string[]>
  fonts: IdmlFontUse[]
}

export class ReportCollector {
  readonly locations = new Map<string, string[]>()
  readonly unsupportedElements = new Map<string, number>()
  readonly unsupportedStyleProperties = new Map<string, number>()
  readonly unsupportedOverrideProperties = new Map<string, number>()
  readonly unsupportedSpecialCharacters = new Map<string, number>()
  readonly unsupportedLanguages = new Map<string, number>()
  readonly spotColors = new Map<string, number>()
  readonly fonts = new Map<string, IdmlFontUse>()

  constructor(seed?: Partial<IdmlReportData>) {
    const fill = (target: Map<string, number>, values: Record<string, number> | undefined) => {
      for (const [name, count] of Object.entries(values ?? {})) target.set(name, count)
    }
    fill(this.unsupportedElements, seed?.unsupportedElements)
    fill(this.unsupportedStyleProperties, seed?.unsupportedStyleProperties)
    fill(this.unsupportedOverrideProperties, seed?.unsupportedOverrideProperties)
    fill(this.unsupportedSpecialCharacters, seed?.unsupportedSpecialCharacters)
    fill(this.unsupportedLanguages, seed?.unsupportedLanguages)
    fill(this.spotColors, seed?.spotColors)
    for (const [key, locations] of Object.entries(seed?.locations ?? {})) this.locations.set(key, [...locations])
    for (const font of seed?.fonts ?? []) this.font(font.appliedFont, font.fontStyle, font.locations[0] ?? 'Resources/Styles.xml')
  }

  add(bucket: Map<string, number>, name: string, location: string, count = 1): void {
    bucket.set(name, (bucket.get(name) ?? 0) + count)
    const key = `${this.bucketName(bucket)}:${name}`
    const values = this.locations.get(key) ?? []
    if (values.length < 5 && !values.includes(location)) values.push(location)
    this.locations.set(key, values)
  }

  font(appliedFont: string | undefined, fontStyle: string | undefined, location: string): void {
    if (!appliedFont) return
    const key = `${appliedFont}\u0000${fontStyle ?? ''}`
    const found = this.fonts.get(key) ?? { appliedFont, ...(fontStyle ? { fontStyle } : {}), locations: [] }
    if (found.locations.length < 5 && !found.locations.includes(location)) found.locations.push(location)
    this.fonts.set(key, found)
  }

  data(): IdmlReportData {
    const record = (values: Map<string, number>) => Object.fromEntries([...values].sort(([a], [b]) => a.localeCompare(b)))
    return {
      unsupportedElements: record(this.unsupportedElements),
      unsupportedStyleProperties: record(this.unsupportedStyleProperties),
      unsupportedOverrideProperties: record(this.unsupportedOverrideProperties),
      unsupportedSpecialCharacters: record(this.unsupportedSpecialCharacters),
      unsupportedLanguages: record(this.unsupportedLanguages),
      spotColors: record(this.spotColors),
      locations: Object.fromEntries([...this.locations].sort(([a], [b]) => a.localeCompare(b))),
      fonts: [...this.fonts.values()],
    }
  }

  private bucketName(bucket: Map<string, number>): string {
    if (bucket === this.unsupportedElements) return 'element'
    if (bucket === this.unsupportedStyleProperties) return 'style'
    if (bucket === this.unsupportedOverrideProperties) return 'override'
    if (bucket === this.unsupportedSpecialCharacters) return 'special'
    if (bucket === this.unsupportedLanguages) return 'language'
    return 'spot'
  }
}
