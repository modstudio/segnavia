import type { Element } from 'domhandler'
import { formatRoundedNumber } from './positioned-box.ts'
import type { IdmlAnchoredFrame, IdmlStory, IdmlTextNode } from './types.ts'
import { localName } from './xml.ts'

type ObjectStyle = { id: string; basedOn?: string; properties: Record<string, string> }

function elementProperties(element: Element): Record<string, string> {
  const result = { ...element.attribs }
  const properties = element.children.find((child): child is Element => child.type === 'tag' && localName(child.name) === 'Properties')
  for (const child of properties?.children ?? []) {
    if (child.type !== 'tag') continue
    const text = child.children
      .map((value) => ('data' in value ? value.data : ''))
      .join('')
      .trim()
    if (text) result[localName(child.name)] = text
  }
  return result
}

function objectStyles(elements: Element[]): Map<string, ObjectStyle> {
  const result = new Map<string, ObjectStyle>()
  for (const element of elements.filter((candidate) => localName(candidate.name) === 'ObjectStyle')) {
    const properties = elementProperties(element)
    if (!properties.Self) continue
    result.set(properties.Self, {
      id: properties.Self,
      ...(properties.BasedOn ? { basedOn: properties.BasedOn } : {}),
      properties: Object.fromEntries(Object.entries(properties).filter(([name]) => !['Self', 'Name', 'BasedOn'].includes(name))),
    })
  }
  return result
}

function flattenedStyle(id: string | undefined, styles: Map<string, ObjectStyle>): Record<string, string> {
  const chain: ObjectStyle[] = []
  const seen = new Set<string>()
  let current = id ? styles.get(id) : undefined
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.unshift(current)
    current = current.basedOn ? styles.get(current.basedOn) : undefined
  }
  return Object.assign({}, ...chain.map((style) => style.properties))
}

function descendants(node: IdmlTextNode): IdmlTextNode[] {
  return node.children.flatMap((child) => [child, ...descendants(child)])
}

function width(node: IdmlTextNode): number | undefined {
  const anchors = descendants(node)
    .flatMap((child) => (child.attributes.Anchor ? [child.attributes.Anchor.trim().split(/\s+/).map(Number)] : []))
    .filter((point) => point.length === 2 && point.every(Number.isFinite))
  if (anchors.length === 0) return undefined
  const transform = (node.attributes.ItemTransform ?? '').trim().split(/\s+/).map(Number)
  const xs = anchors.map(([x, y]) =>
    transform.length === 6 && transform.every(Number.isFinite)
      ? (transform[0] as number) * (x as number) + (transform[2] as number) * (y as number)
      : (x as number),
  )
  const value = Math.max(...xs) - Math.min(...xs)
  return value > 0 ? value : undefined
}

const finite = (value: string | undefined): number | undefined => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function corner(values: Record<string, string>, name: 'TopLeft' | 'TopRight' | 'BottomLeft' | 'BottomRight'): number | undefined {
  const option = values[`${name}CornerOption`] ?? values.CornerOption
  const radius = finite(values[`${name}CornerRadius`] ?? values.CornerRadius)
  return option && !option.endsWith('None') && radius && radius > 0 ? radius : undefined
}

function anchoredFrame(hostStory: string, node: IdmlTextNode, styles: Map<string, ObjectStyle>): IdmlAnchoredFrame | undefined {
  const story = node.attributes.ParentStory
  if (!story) return undefined
  const setting = node.children.find((child) => child.name === 'Properties')?.children.find((child) => child.name === 'AnchoredObjectSetting')
  const style = flattenedStyle(node.attributes.AppliedObjectStyle, styles)
  const values = { ...style, ...node.attributes }
  const strokeWeight = finite(values.StrokeWeight)
  const strokeColor = values.StrokeColor
  const corners = {
    topLeft: corner(values, 'TopLeft'),
    topRight: corner(values, 'TopRight'),
    bottomLeft: corner(values, 'BottomLeft'),
    bottomRight: corner(values, 'BottomRight'),
  }
  const anchorYoffset = finite(setting?.attributes.AnchorYoffset)
  return {
    hostStory,
    story,
    location: node.location,
    width: width(node),
    position: setting?.attributes.AnchoredPosition ?? 'InlinePosition',
    ...(anchorYoffset === undefined ? {} : { anchorYoffset }),
    ...(values.FillColor && !values.FillColor.endsWith('/None') && values.FillColor !== 'None' ? { fill: values.FillColor } : {}),
    ...(strokeWeight && strokeWeight > 0 && strokeColor && !strokeColor.endsWith('/None') && strokeColor !== 'None'
      ? { stroke: { color: strokeColor, weight: strokeWeight } }
      : {}),
    ...(Object.values(corners).some((value) => value !== undefined) ? { corners } : {}),
  }
}

export function parseAnchoredFrames(stories: IdmlStory[], elements: Element[]): IdmlAnchoredFrame[] {
  const styles = objectStyles(elements)
  return stories.flatMap((story) =>
    story.root ? descendants(story.root).flatMap((node) => (node.name === 'TextFrame' ? [anchoredFrame(story.id, node, styles)].filter(Boolean) : [])) : [],
  ) as IdmlAnchoredFrame[]
}

function cornerDeclarations(frame: IdmlAnchoredFrame, direction: 'ltr' | 'rtl'): string[] {
  const corners = frame.corners
  if (!corners) return []
  const values =
    direction === 'rtl'
      ? [corners.topRight, corners.topLeft, corners.bottomRight, corners.bottomLeft]
      : [corners.topLeft, corners.topRight, corners.bottomLeft, corners.bottomRight]
  const properties = ['border-start-start-radius', 'border-start-end-radius', 'border-end-start-radius', 'border-end-end-radius']
  return values.flatMap((value, index) => (value === undefined ? [] : [`${properties[index]}:${formatRoundedNumber(value)}pt`]))
}

export function anchoredFrameStyle(frame: IdmlAnchoredFrame, resolveColor: (color: string) => string | undefined, direction: 'ltr' | 'rtl'): string {
  const output = [
    `display:inline-block`,
    `inline-size:${formatRoundedNumber(frame.width ?? 0)}pt`,
    `vertical-align:${frame.anchorYoffset === undefined ? 'baseline' : `${formatRoundedNumber(frame.anchorYoffset)}pt`}`,
  ]
  const fill = frame.fill ? resolveColor(frame.fill) : undefined
  if (fill && fill !== 'none') output.push(`background:${fill}`)
  const stroke = frame.stroke ? resolveColor(frame.stroke.color) : undefined
  if (stroke && stroke !== 'none' && frame.stroke) output.push(`border:${formatRoundedNumber(frame.stroke.weight)}pt solid ${stroke}`)
  output.push(...cornerDeclarations(frame, direction))
  return output.join(';')
}
