import { expect, test } from 'bun:test'
import type { AssetResolver, ControllerOptions, ResolvedAsset } from '@segnavia/frame'
import type { ResolvePlacement } from '@segnavia/html'

function acceptsEverySeam(resolve: AssetResolver) {
  const slot: Parameters<typeof import('@segnavia/frame')['slotAssetFrom']>[0] = resolve
  const board: Parameters<typeof import('@segnavia/frame')['boardItemFrom']>[0] = resolve
  const idml: Parameters<typeof import('@segnavia/idml')['idmlAssetFrom']>[0] = resolve
  const placements: ControllerOptions['placements'] = { resolve }
  return { slot, board, idml, placements }
}

test('one asset resolver type serves every placement adapter and frame option', () => {
  const resolve: ResolvePlacement<ResolvedAsset> = async () => undefined
  const assetResolver: AssetResolver = resolve
  expect(acceptsEverySeam(assetResolver)).toBeDefined()
})
