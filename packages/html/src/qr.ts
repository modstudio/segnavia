import { Element } from 'domhandler'
import qrcode from 'qrcode-generator'

// The largest QR payload considered before encoding; level M at version 40 holds 2331 bytes.
const QR_PAYLOAD_LIMIT = 4096

// The QR payload is the link's ASCII form (percent-encoded path, punycode host),
// which opens the same address; the encoder writes each character as one byte.
export function qrPayload(value: string): string | undefined {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.href.length > QR_PAYLOAD_LIMIT) return undefined
    const code = qrcode(0, 'M')
    code.addData(url.href)
    code.make()
    return url.href
  } catch {
    return undefined
  }
}

/** A QR code of the link at level M, drawn in currentColor with a four-module quiet zone. */
export function qrSvg(value: string): Element {
  const code = qrcode(0, 'M')
  code.addData(qrPayload(value) ?? value)
  code.make()
  const modules = code.getModuleCount()
  const children: Element[] = []
  for (let row = 0; row < modules; row++) {
    for (let column = 0; column < modules; column++) {
      if (code.isDark(row, column))
        children.push(new Element('rect', { x: String(column + 4), y: String(row + 4), width: '1', height: '1', fill: 'currentColor' }))
    }
  }
  return new Element(
    'svg',
    {
      viewBox: `0 0 ${modules + 8} ${modules + 8}`,
      'shape-rendering': 'crispEdges',
      role: 'img',
      'aria-label': value,
    },
    children,
  )
}
