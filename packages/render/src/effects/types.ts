export interface EffectsReport {
  /** Luminosity masks rewritten from a grayscale image group to a direct image alpha mask. */
  rule1: number
  /** Nested one-axis shading composites rewritten as an interpolated image and direct alpha mask. */
  ruleC: number
  /** Reserved for vector mask groups; this rule is not currently applied. */
  rule2: number
  /** Reserved for nested masks that Rule C cannot express; this rule is not currently applied. */
  rule3: number
  /** Reserved for rasterized effect regions; this rule is not currently applied. */
  rule4: number
  /** Soft masks left in the form Chromium wrote. */
  kept: number
}
