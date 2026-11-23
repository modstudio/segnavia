export { FontRefusedError } from '@segnavia/frame/fonts'
export type { MotifsOptions } from '@segnavia/frame/motifs'
export type { PreparedSlots, ResolvedPlacement, ResolvePlacement } from '@segnavia/html'
export { captureImage } from './capture-image.ts'
export { COVER_IMAGE_OMITTED, type CoverImageOptions, type CoverImagePlan, coverImagePlan } from './cover-image.ts'
export { type DirectoryFontSourceOptions, directoryFontSource } from './directory-font-source.ts'
export type { EffectsReport } from './effects/types.ts'
export {
  type ColorProfileUse,
  type InputRefusal,
  RenderColorProfileError,
  RendererUnavailableError,
  RenderInputsRefusedError,
  RenderLimitError,
  RenderOversetError,
  RenderRefusedError,
} from './errors.ts'
export { fontFaces } from './font-faces.ts'
export type { LocalFontsOptions, LocalFontsReport } from './local-fonts.ts'
export type { MergePdfsOptions } from './merge-pdf-options.ts'
export type {
  AssetAnswer,
  Assets,
  Font,
  ImageOptions,
  MarksReport,
  OverflowContribution,
  OverflowEntry,
  OverflowPart,
  OverflowReport,
  PageImageOptions,
  ProofImageOptions,
  RenderOptions,
  SlideImageOptions,
} from './options.ts'
export { type MergedPdf, type MergePart, type PdfPartRefusal, PdfPartsRefusedError } from './pdf-merge.ts'
export type { PressDestination, PressImage, PressReport } from './press/types.ts'
export type { PdfPermissions, Protection } from './protection-options.ts'
export { RenderTimeoutError } from './render-deadline.ts'
export {
  type BookPdfOptions,
  type BookPlanOptions,
  CONTAINER_ARGS,
  DEFAULT_JS_HEAP_MB,
  PAGE_READY_BOUND_MS,
  type PagePdfOptions,
  type PdfPageImageOptions,
  RENDER_BOUND_MS,
  type Renderer,
  type RendererOptions,
  type StampPdfOptions,
} from './renderer.ts'
export { filledBook } from './slot-fill.ts'
export type { Watermark } from './watermark-options.ts'
