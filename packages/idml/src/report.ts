export interface IdmlFontUse {
  appliedFont: string
  fontStyle?: string
  locations: string[]
}

export interface IdmlMixedMasterChapter {
  chapter: string
  side: 'recto' | 'verso'
  masters: string[]
  chosen: string
}

export interface IdmlLinkUse {
  uri: string
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
  unmappedFonts: IdmlFontUse[]
  links: IdmlLinkUse[]
  strippedAssetContent: Record<string, string[]>
  versoOpenings: Record<string, string[]>
  mixedMasterChapters: IdmlMixedMasterChapter[]
}

const BUCKET_NAMES = {
  unsupportedElements: 'element',
  unsupportedStyleProperties: 'style',
  unsupportedOverrideProperties: 'override',
  unsupportedSpecialCharacters: 'special',
  unsupportedLanguages: 'language',
  spotColors: 'spot',
} as const

type BucketKey = keyof typeof BUCKET_NAMES

export function fontUseKey(appliedFont: string, fontStyle: string | undefined): string {
  return `${appliedFont}\u0000${fontStyle ?? ''}`
}

export class ReportCollector {
  readonly locations = new Map<string, string[]>()
  readonly fonts = new Map<string, IdmlFontUse>()
  readonly unmappedFonts = new Map<string, IdmlFontUse>()
  readonly links = new Map<string, IdmlLinkUse>()
  readonly strippedAssetContent = new Map<string, string[]>()
  readonly versoOpenings = new Map<string, string[]>()
  readonly mixedMasterChapters: IdmlMixedMasterChapter[]
  private readonly buckets = Object.fromEntries(Object.keys(BUCKET_NAMES).map((name) => [name, new Map<string, number>()])) as Record<
    BucketKey,
    Map<string, number>
  >

  get unsupportedElements(): Map<string, number> {
    return this.buckets.unsupportedElements
  }
  get unsupportedStyleProperties(): Map<string, number> {
    return this.buckets.unsupportedStyleProperties
  }
  get unsupportedOverrideProperties(): Map<string, number> {
    return this.buckets.unsupportedOverrideProperties
  }
  get unsupportedSpecialCharacters(): Map<string, number> {
    return this.buckets.unsupportedSpecialCharacters
  }
  get unsupportedLanguages(): Map<string, number> {
    return this.buckets.unsupportedLanguages
  }
  get spotColors(): Map<string, number> {
    return this.buckets.spotColors
  }

  constructor(seed?: Partial<IdmlReportData>) {
    this.mixedMasterChapters = [...(seed?.mixedMasterChapters ?? [])]
    for (const name of Object.keys(BUCKET_NAMES) as BucketKey[]) {
      for (const [key, count] of Object.entries(seed?.[name] ?? {})) this.buckets[name].set(key, count)
    }
    for (const [key, locations] of Object.entries(seed?.locations ?? {})) this.locations.set(key, [...locations])
    this.seedKeyedRecords(seed)
  }

  private seedKeyedRecords(seed?: Partial<IdmlReportData>): void {
    for (const font of seed?.fonts ?? []) this.font(font.appliedFont, font.fontStyle, font.locations[0] ?? 'Resources/Styles.xml')
    for (const font of seed?.unmappedFonts ?? []) {
      for (const location of font.locations) this.unmappedFont(font.appliedFont, font.fontStyle, location)
    }
    for (const link of seed?.links ?? []) for (const location of link.locations) this.link(link.uri, location)
    for (const [uri, findings] of Object.entries(seed?.strippedAssetContent ?? {})) {
      for (const finding of findings) this.strippedAsset(uri, finding)
    }
    for (const [story, pages] of Object.entries(seed?.versoOpenings ?? {})) {
      for (const page of pages) this.versoOpening(story, page)
    }
  }

  add(bucket: Map<string, number>, name: string, location: string, count = 1): void {
    bucket.set(name, (bucket.get(name) ?? 0) + count)
    const key = `${this.bucketName(bucket)}:${name}`
    const values = this.locations.get(key) ?? []
    if (values.length < 5 && !values.includes(location)) values.push(location)
    this.locations.set(key, values)
  }

  addOnce(bucket: Map<string, number>, name: string, location: string): void {
    const key = `${this.bucketName(bucket)}:${name}`
    if (this.locations.get(key)?.includes(location)) return
    this.add(bucket, name, location)
  }

  font(appliedFont: string | undefined, fontStyle: string | undefined, location: string): void {
    if (!appliedFont) return
    this.record(this.fonts, appliedFont, fontStyle, location)
  }

  unmappedFont(appliedFont: string, fontStyle: string | undefined, location: string): void {
    this.record(this.unmappedFonts, appliedFont, fontStyle, location)
  }

  link(uri: string, location: string): void {
    const found = this.links.get(uri) ?? { uri, locations: [] }
    this.recordLocation(found.locations, location)
    this.links.set(uri, found)
  }

  strippedAsset(uri: string, finding: string): void {
    const found = this.strippedAssetContent.get(uri) ?? []
    this.recordLocation(found, finding)
    this.strippedAssetContent.set(uri, found)
  }

  versoOpening(story: string, page: string): void {
    const found = this.versoOpenings.get(story) ?? []
    this.recordLocation(found, page)
    this.versoOpenings.set(story, found)
  }

  private record(target: Map<string, IdmlFontUse>, appliedFont: string, fontStyle: string | undefined, location: string): void {
    const key = fontUseKey(appliedFont, fontStyle)
    const found = target.get(key) ?? { appliedFont, ...(fontStyle ? { fontStyle } : {}), locations: [] }
    this.recordLocation(found.locations, location)
    target.set(key, found)
  }

  private recordLocation(target: string[], location: string): void {
    if (target.length < 5 && !target.includes(location)) target.push(location)
  }

  data(): IdmlReportData {
    const record = (values: Map<string, number>) => Object.fromEntries([...values].sort(([a], [b]) => a.localeCompare(b)))
    const buckets = Object.fromEntries((Object.keys(BUCKET_NAMES) as BucketKey[]).map((name) => [name, record(this.buckets[name])])) as Pick<
      IdmlReportData,
      BucketKey
    >
    return {
      ...buckets,
      locations: Object.fromEntries([...this.locations].sort(([a], [b]) => a.localeCompare(b))),
      fonts: [...this.fonts.values()],
      unmappedFonts: [...this.unmappedFonts.values()],
      links: [...this.links.values()],
      strippedAssetContent: Object.fromEntries([...this.strippedAssetContent].sort(([a], [b]) => a.localeCompare(b))),
      versoOpenings: Object.fromEntries([...this.versoOpenings].sort(([a], [b]) => a.localeCompare(b))),
      mixedMasterChapters: [...this.mixedMasterChapters],
    }
  }

  private bucketName(bucket: Map<string, number>): string {
    const found = (Object.keys(BUCKET_NAMES) as BucketKey[]).find((name) => this.buckets[name] === bucket)
    if (!found) throw new Error('Report bucket is not registered.')
    return BUCKET_NAMES[found]
  }
}
