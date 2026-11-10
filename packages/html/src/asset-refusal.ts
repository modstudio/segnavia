import { type AssetRefusal, authoredOrigin, type OriginApproval, originDecision } from '@segnavia/format'

export function scriptsOffRefusal(value: string): AssetRefusal {
  const origin = authoredOrigin(value)
  return {
    url: value,
    ...(origin === undefined ? {} : { origin }),
    kind: 'script',
    reason: 'scripts-off',
    message: `${value} is refused because scripts are off`,
    advice: 'enable scripts to clear this refusal',
  }
}

export function srcsetAssetRefusal(
  value: string,
  candidates: readonly string[] | undefined,
  dataImage: boolean,
  options: { origins?: Iterable<OriginApproval>; keepScripts?: boolean },
  safeImage: (candidate: string) => boolean,
): AssetRefusal | '' {
  if (!candidates) {
    if (dataImage) return ''
    return {
      url: value,
      kind: 'image',
      reason: 'unreadable-srcset',
      message: 'srcset could not establish a readable candidate list',
      advice: 'use a valid srcset candidate list or a supported data-image srcset to clear this refusal',
    }
  }
  for (const candidate of candidates) {
    if (safeImage(candidate)) continue
    const decision = originDecision(candidate, 'image', options.origins, options.keepScripts === true)
    if (!decision.allowed) return decision.refusal
  }
  return ''
}
