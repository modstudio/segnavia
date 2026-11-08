import type { Document } from './document.ts'
import { Brand, type StyleSheet } from './style-sheet.ts'

export interface BrandSource {
  brand(name: string, options: { signal: AbortSignal }): Promise<StyleSheet | undefined>
}

export async function resolveBrand(document: Document, source: BrandSource | undefined, signal: AbortSignal): Promise<StyleSheet | undefined> {
  const name = document.brand
  if (name === undefined) return undefined
  if (!source) {
    throw new Error(`Brand ${JSON.stringify(name)} was named without a BrandSource; provide a BrandSource or remove the brand name to clear this refusal`)
  }
  const value = await source.brand(name, { signal })
  if (value === undefined) {
    throw new Error(`Brand ${JSON.stringify(name)} is unknown to the BrandSource; return that brand or remove the brand name to clear this refusal`)
  }
  const parsed = Brand.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new Error(
      `Brand ${JSON.stringify(name)} returned an invalid style sheet at ${issue?.path.join('.') || '<root>'}; return a valid Brand or remove the brand name to clear this refusal: ${issue?.message ?? parsed.error.message}`,
    )
  }
  return parsed.data
}
