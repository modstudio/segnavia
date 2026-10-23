import { expect, test } from 'bun:test'
import { BACKDROP_RASTER_LAYER, withBackdropRasterLayer } from './backdrop-layers.ts'

const frost = 'url("data:image/jpeg;base64,frost")'
const none = {
  clip: 'border-box',
  color: 'rgba(0, 0, 0, 0)',
  image: 'none',
  origin: 'padding-box',
  position: '0% 0%',
  repeat: 'repeat',
  size: 'auto',
}

test('installs the JPEG as the only image layer when the element has none', () => {
  expect(withBackdropRasterLayer(none, frost)).toEqual({
    clip: BACKDROP_RASTER_LAYER.clip,
    color: 'rgba(0, 0, 0, 0)',
    image: frost,
    origin: BACKDROP_RASTER_LAYER.origin,
    position: BACKDROP_RASTER_LAYER.position,
    repeat: BACKDROP_RASTER_LAYER.repeat,
    size: BACKDROP_RASTER_LAYER.size,
  })
})

test('keeps a gradient above the JPEG and matches each layer', () => {
  expect(
    withBackdropRasterLayer(
      {
        clip: 'border-box',
        color: 'rgba(0, 0, 0, 0)',
        image: 'linear-gradient(145deg, rgba(255, 255, 255, 0.239), rgba(255, 255, 255, 0.051))',
        origin: 'padding-box',
        position: '0% 0%',
        repeat: 'repeat',
        size: '350px 280px',
      },
      frost,
    ),
  ).toEqual({
    clip: 'border-box, border-box',
    color: 'rgba(0, 0, 0, 0)',
    image: 'linear-gradient(145deg, rgba(255, 255, 255, 0.239), rgba(255, 255, 255, 0.051)), url("data:image/jpeg;base64,frost")',
    origin: 'padding-box, border-box',
    position: '0% 0%, 0 0',
    repeat: 'repeat, no-repeat',
    size: '350px 280px, 100% 100%',
  })
})

test('promotes a translucent color above the JPEG with color clip and origin defaults', () => {
  const color = 'rgba(255, 255, 255, 0.121)'
  expect(withBackdropRasterLayer({ ...none, color }, frost)).toEqual({
    clip: 'border-box, border-box',
    color: 'transparent',
    image: `linear-gradient(${color}, ${color}), ${frost}`,
    origin: 'padding-box, border-box',
    position: '0 0, 0 0',
    repeat: 'no-repeat, no-repeat',
    size: '100% 100%, 100% 100%',
  })
})

test('keeps authored image layers above a promoted color, using the last layer clip', () => {
  const color = 'rgb(255, 0, 0)'
  expect(
    withBackdropRasterLayer(
      {
        clip: 'padding-box, content-box',
        color,
        image: 'url("top.png"), url("mid.png")',
        origin: 'content-box, padding-box',
        position: 'left top, right bottom',
        repeat: 'no-repeat, repeat-x',
        size: 'cover, contain',
      },
      frost,
    ),
  ).toEqual({
    clip: 'padding-box, content-box, content-box, border-box',
    color: 'transparent',
    image: `url("top.png"), url("mid.png"), linear-gradient(${color}, ${color}), ${frost}`,
    origin: 'content-box, padding-box, padding-box, border-box',
    position: 'left top, right bottom, 0 0, 0 0',
    repeat: 'no-repeat, repeat-x, no-repeat, no-repeat',
    size: 'cover, contain, 100% 100%, 100% 100%',
  })
})
