import path from 'node:path'
import { chromium } from 'playwright-core'
import { chromiumPath, ROOT } from './config.ts'

const browser = await chromium.launch({ executablePath: chromiumPath(), headless: true })
const page = await browser.newPage()
await page.setContent('<canvas id="scene" width="720" height="480"></canvas>')

const photographs = await page.evaluate(() => {
  const canvas = document.querySelector<HTMLCanvasElement>('#scene')
  const context = canvas?.getContext('2d')
  if (!canvas || !context) throw new Error('Chromium could not create the photo canvas.')

  const random = (initial: number) => {
    let state = initial >>> 0
    return () => {
      state ^= state << 13
      state ^= state >>> 17
      state ^= state << 5
      return (state >>> 0) / 4_294_967_296
    }
  }
  const image = (seed: number, palette: [string, string, string, string, string, string], horizon: number): string => {
    const next = random(seed)
    const sky = context.createLinearGradient(0, 0, 0, canvas.height)
    sky.addColorStop(0, palette[0])
    sky.addColorStop(1, palette[1])
    context.fillStyle = sky
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = palette[2]
    context.fillRect(0, horizon, canvas.width, canvas.height - horizon)
    for (let layer = 0; layer < 5; layer++) {
      context.fillStyle = layer % 2 === 0 ? palette[3] : palette[4]
      context.beginPath()
      context.moveTo(0, canvas.height)
      for (let x = 0; x <= canvas.width; x += 45) {
        const y = horizon + 25 + layer * 36 + Math.sin(x / 75 + layer) * 24 + next() * 42
        context.lineTo(x, y)
      }
      context.lineTo(canvas.width, canvas.height)
      context.closePath()
      context.fill()
    }
    context.fillStyle = palette[5]
    context.fillRect(82, 95, 22, 240)
    context.beginPath()
    context.arc(93, 82, 64, 0, Math.PI * 2)
    context.fill()
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      const noise = Math.floor((next() - 0.5) * 14)
      pixels.data[offset] = (pixels.data[offset] ?? 0) + noise
      pixels.data[offset + 1] = (pixels.data[offset + 1] ?? 0) + noise
      pixels.data[offset + 2] = (pixels.data[offset + 2] ?? 0) + noise
    }
    context.putImageData(pixels, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.84)
  }
  return [
    image(0x51a7cafe, ['#6ea8cc', '#d7c6a2', '#587342', '#365d37', '#729052', '#263c25'], 258),
    image(0x0b5e55ed, ['#e7b08f', '#7e5665', '#61392d', '#9b5941', '#d08b62', '#f0c1a1'], 292),
    image(0x1a2b3c4d, ['#83b9d2', '#dce5df', '#6e756f', '#3d5a55', '#8a9b7c', '#d6c7a7'], 235),
  ]
})
await browser.close()

const [landscape, portrait, detail] = photographs
const fixture = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Photo control</title>
<style>
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;font-family:Arial,sans-serif}body{padding:34px;background:#e9e4d8;color:#172027}h1{margin:0 0 22px;font-size:36px}.photos{display:grid;grid-template-columns:3fr 2fr;grid-template-rows:390px 260px;gap:14px}.photos img{display:block;width:100%;height:100%;object-fit:cover;border:4px solid #fff}.large{grid-row:1 / 3}.caption{position:absolute;inset:auto 34px 18px;font-size:13px}
</style>
</head>
<body>
<h1>Photo control</h1>
<main class="photos"><img class="large" alt="Generated landscape" src="${landscape}"><img alt="Generated warm portrait" src="${portrait}"><img alt="Generated landscape detail" src="${detail}"></main>
<p class="caption">Deterministic offline JPEG samples · fixed seed</p>
</body>
</html>
`

const output = path.join(ROOT, 'fixtures/fidelity/control-photo.html')
await Bun.write(output, fixture)
console.log(`Wrote ${output} (${Buffer.byteLength(fixture).toLocaleString()} bytes)`)
