export interface LittleCms {
  cmsCreate_sRGBProfile(): number
  cmsOpenProfileFromMem(bytes: Uint8Array, length: number): number
  cmsCloseProfile(profile: number): void
  cmsCreateTransform(input: number, inputFormat: number, output: number, outputFormat: number, intent: number, flags: number): number
  cmsDeleteTransform(transform: number): void
  cmsDoTransform(transform: number, input: Uint8Array | Float32Array, count: number): Uint8Array | Float32Array
}

interface LittleCmsModule {
  instantiate(options?: { locateFile?(name: string): string }): Promise<LittleCms>
}

export const TYPE_RGB_DBL = 4_456_472
export const TYPE_CMYK_DBL = 4_587_552
export const TYPE_RGB_8 = 262_169
export const TYPE_CMYK_8 = 393_249
export const INTENT_RELATIVE_COLORIMETRIC = 1
export const cmsFLAGS_NOCACHE = 0x0040
export const cmsFLAGS_NOOPTIMIZE = 0x0100
export const cmsFLAGS_BLACKPOINTCOMPENSATION = 0x2000

export async function instantiate(): Promise<LittleCms> {
  const loader = new URL('./dist/lcms.js', import.meta.url).href
  const module = (await import(loader)) as unknown as LittleCmsModule
  return module.instantiate()
}
