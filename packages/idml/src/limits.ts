export const MAX_IDML_PACKAGE_BYTES = 64 * 1024 * 1024
export const MAX_IDML_ENTRIES = 4_096
export const MAX_IDML_PART_BYTES = 32 * 1024 * 1024
export const MAX_IDML_TOTAL_INFLATED_BYTES = 256 * 1024 * 1024
export const MAX_IDML_XML_DEPTH = 256

export interface IdmlLimits {
  packageBytes: number
  entries: number
  partBytes: number
  totalInflatedBytes: number
  xmlDepth: number
}

export const IDML_LIMITS: Readonly<IdmlLimits> = {
  packageBytes: MAX_IDML_PACKAGE_BYTES,
  entries: MAX_IDML_ENTRIES,
  partBytes: MAX_IDML_PART_BYTES,
  totalInflatedBytes: MAX_IDML_TOTAL_INFLATED_BYTES,
  xmlDepth: MAX_IDML_XML_DEPTH,
}
