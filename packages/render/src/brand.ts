import { type BrandSource, type Document, resolveBrand } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'

export async function resolveRenderBrand(document: Document, source: BrandSource | undefined, signal: AbortSignal) {
  try {
    return await resolveBrand(document, source, signal)
  } catch (error) {
    throw new RenderRefusedError(error instanceof Error ? error.message : String(error))
  }
}
