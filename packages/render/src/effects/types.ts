/**
 * Counts the implemented rewrites. Rule 2 is unbuilt, Rule 3 is left out
 * because measurements show it is ineffective, and Rule 4 is unbuilt and
 * will be opt-in and off by default when implemented.
 */
export interface EffectsReport {
  /** Luminosity masks rewritten from a grayscale image group to a direct image alpha mask. */
  rule1: number
  /** Nested one-axis shading composites rewritten as an interpolated image and direct alpha mask. */
  ruleC: number
  /** Soft masks left in the form Chromium wrote. */
  kept: number
}

export const GENERATED_EFFECT_IMAGE_KEY = 'SegnaviaGeneratedEffect'
