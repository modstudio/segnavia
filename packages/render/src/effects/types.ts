export interface EffectsReport {
  /** Luminosity masks rewritten from a grayscale image group to a direct image alpha mask. */
  rule1: number
  /** Reserved for vector mask groups; this rule is not currently applied. */
  rule2: number
  /** Reserved for combined nested masks; this rule is not currently applied. */
  rule3: number
  /** Reserved for rasterized effect regions; this rule is not currently applied. */
  rule4: number
  /** Soft masks left in the form Chromium wrote. */
  kept: number
}
