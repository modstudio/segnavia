import type { AssetRefusal } from '@segnavia/format'

export function assetRefusalText(refusal: AssetRefusal): string {
  return `${refusal.message}; ${refusal.advice}`
}

export function scriptsOffRefusal(value: string): AssetRefusal {
  let origin: string | undefined
  try {
    origin = new URL(value).origin.toLowerCase()
  } catch {}
  return {
    url: value,
    ...(origin === undefined ? {} : { origin }),
    kind: 'script',
    reason: 'scripts-off',
    message: `${value} is refused because scripts are off`,
    advice: 'enable scripts to clear this refusal',
  }
}
