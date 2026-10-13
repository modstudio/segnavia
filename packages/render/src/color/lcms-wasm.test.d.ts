declare module 'lcms-wasm' {
  export const TYPE_RGB_DBL: number
  export const TYPE_CMYK_DBL: number
  export const TYPE_RGB_8: number
  export const TYPE_CMYK_8: number
  export const INTENT_RELATIVE_COLORIMETRIC: number
  export const cmsFLAGS_BLACKPOINTCOMPENSATION: number
  export const cmsFLAGS_NOOPTIMIZE: number
  export const cmsFLAGS_NOCACHE: number

  export interface Lcms {
    cmsCreate_sRGBProfile(): number
    cmsOpenProfileFromMem(bytes: Uint8Array, length: number): number
    cmsCloseProfile(profile: number): void
    cmsCreateTransform(input: number, inputFormat: number, output: number, outputFormat: number, intent: number, flags: number): number
    cmsDeleteTransform(transform: number): void
    cmsDoTransform(transform: number, input: Uint8Array | Float32Array, count: number): Uint8Array | Float32Array
  }

  export function instantiate(options?: { locateFile?(name: string): string }): Promise<Lcms>
}
