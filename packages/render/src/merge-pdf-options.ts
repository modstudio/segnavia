import { DocumentMetadata, type Limits, parseLimits } from '@segnavia/format'
import { RenderRefusedError } from './errors.ts'
import { refuseUnknownOptions } from './render-option-keys.ts'

export interface MergePdfsOptions {
  metadata: DocumentMetadata
  limits?: Limits
  boundMs?: number
  skipRefused?: boolean
}

export function parseMergePdfsOptions(options: MergePdfsOptions): MergePdfsOptions {
  if (!options || typeof options !== 'object') {
    throw new RenderRefusedError('mergePdfs metadata is required; pass options.metadata to clear this refusal.')
  }
  refuseUnknownOptions('mergePdfs', options)
  if (options.metadata === undefined) {
    throw new RenderRefusedError('mergePdfs metadata is required; pass options.metadata to clear this refusal.')
  }
  if (options.boundMs !== undefined && (!Number.isFinite(options.boundMs) || options.boundMs < 0)) {
    throw new RenderRefusedError('mergePdfs boundMs needs to be a non-negative finite number; pass a valid boundMs to clear this refusal.')
  }
  if (options.skipRefused !== undefined && typeof options.skipRefused !== 'boolean') {
    throw new RenderRefusedError('mergePdfs skipRefused needs to be a boolean; pass true, false, or omit it to clear this refusal.')
  }
  return {
    ...options,
    metadata: DocumentMetadata.parse(options.metadata),
    limits: parseLimits(options.limits, 'host'),
  }
}
