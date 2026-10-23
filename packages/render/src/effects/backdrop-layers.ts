export interface BackgroundPaint {
  clip: string
  color: string
  image: string
  origin: string
  position: string
  repeat: string
  size: string
}

export const BACKDROP_RASTER_LAYER = {
  clip: 'border-box',
  origin: 'border-box',
  position: '0 0',
  repeat: 'no-repeat',
  size: '100% 100%',
} as const

const COLOR_LAYER = {
  position: '0 0',
  repeat: 'no-repeat',
  size: '100% 100%',
} as const

const CSS_LAYER_FALLBACK = {
  clip: 'border-box',
  origin: 'padding-box',
  position: '0% 0%',
  repeat: 'repeat',
  size: 'auto',
} as const

function splitCssLayers(value: string): string[] {
  const layers: string[] = []
  let start = 0
  let depth = 0
  for (let index = 0; index < value.length; index++) {
    const character = value[index]
    if (character === '(') depth += 1
    else if (character === ')') depth = Math.max(0, depth - 1)
    else if (character === ',' && depth === 0) {
      layers.push(value.slice(start, index).trim())
      start = index + 1
    }
  }
  layers.push(value.slice(start).trim())
  return layers
}

function imageLayers(image: string): string[] {
  return splitCssLayers(image).filter((layer) => layer !== '' && layer !== 'none')
}

function takeLayers(value: string, count: number, fallback: string): string[] {
  if (count === 0) return []
  const layers = splitCssLayers(value).filter((layer) => layer !== '')
  const source = layers.length === 0 ? [fallback] : layers
  return Array.from({ length: count }, (_, index) => source[index % source.length] ?? fallback)
}

function joinLayers(layers: string[]): string {
  return layers.join(', ')
}

function lastLayerValue(value: string, count: number, fallback: string): string {
  const layers = takeLayers(value, count, fallback)
  return layers[layers.length - 1] ?? fallback
}

function isTransparentColor(color: string): boolean {
  const value = color.trim().toLowerCase()
  if (value === '' || value === 'transparent') return true
  const compact = value.replace(/\s+/g, '')
  if (compact === '#0000' || compact === '#00000000') return true
  return /^(?:rgba|hsla)\((?:[^,/]+[,/]){3}0(?:\.0+)?\)$/.test(compact)
}

function stacked(paint: BackgroundPaint, images: number, extra: string | undefined, key: keyof typeof BACKDROP_RASTER_LAYER, fallback: string): string {
  return joinLayers([...takeLayers(paint[key], images, fallback), ...(extra ? [extra] : []), BACKDROP_RASTER_LAYER[key]])
}

export function withBackdropRasterLayer(paint: BackgroundPaint, image: string): BackgroundPaint {
  const images = imageLayers(paint.image)
  const fill = isTransparentColor(paint.color) ? undefined : `linear-gradient(${paint.color}, ${paint.color})`
  const colorClip = fill ? lastLayerValue(paint.clip, images.length, 'border-box') : undefined
  const colorOrigin = fill ? lastLayerValue(paint.origin, images.length, 'padding-box') : undefined
  return {
    clip: stacked(paint, images.length, colorClip, 'clip', CSS_LAYER_FALLBACK.clip),
    color: fill ? 'transparent' : paint.color,
    image: joinLayers([...images, ...(fill ? [fill] : []), image]),
    origin: stacked(paint, images.length, colorOrigin, 'origin', CSS_LAYER_FALLBACK.origin),
    position: stacked(paint, images.length, fill ? COLOR_LAYER.position : undefined, 'position', CSS_LAYER_FALLBACK.position),
    repeat: stacked(paint, images.length, fill ? COLOR_LAYER.repeat : undefined, 'repeat', CSS_LAYER_FALLBACK.repeat),
    size: stacked(paint, images.length, fill ? COLOR_LAYER.size : undefined, 'size', CSS_LAYER_FALLBACK.size),
  }
}
