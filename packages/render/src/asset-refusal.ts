import type { LimitExceeded, RefusalCause } from '@segnavia/format'
import { RenderLimitError, RenderRefusedError } from './errors.ts'

export function collectedAssetRefusal(
  causes: ReadonlyMap<string, RefusalCause>,
  exceeded: ReadonlyMap<string, LimitExceeded>,
  missing: Iterable<string>,
): RenderRefusedError | undefined {
  if (causes.size > 0) {
    const refusals = [...causes.values()]
    const message = refusals.map((refusal) => refusal.message).join('; ')
    const limitEntries = refusals.flatMap((refusal) => {
      const entry = exceeded.get(refusal.message)
      return entry ? [entry] : []
    })
    if (limitEntries.length > 0) {
      return new RenderLimitError(limitEntries as [LimitExceeded, ...LimitExceeded[]], message, { refusals })
    }
    return new RenderRefusedError(message, { code: 'asset', refusals })
  }
  const urls = [...missing]
  if (urls.length === 0) return undefined
  return new RenderRefusedError(`The host assets option did not answer approved requests: ${urls.join(', ')}.`, {
    code: 'asset',
    refusals: urls.map((url) => ({ code: 'unanswered', subject: url, message: `${url} was not answered by the host assets option` })),
  })
}
