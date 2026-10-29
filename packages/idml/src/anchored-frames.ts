import { applyTransform, itemTransform, placementBounds, pointValue } from './placements.ts'
import { formatRoundedNumber } from './positioned-box.ts'
import { flattenedStyle } from './styles.ts'
import type { IdmlAnchoredFrame, IdmlStory, IdmlStyle, IdmlTextNode } from './types.ts'

function descendants(node: IdmlTextNode): IdmlTextNode[] {
  return node.children.flatMap((child) => [child, ...descendants(child)])
}

function width(node: IdmlTextNode): number | undefined {
  const transform = itemTransform(node.attributes.ItemTransform)
  const anchors = descendants(node).flatMap((child) => {
    const point = pointValue(child.attributes.Anchor)
    return point ? [applyTransform(transform, point)] : []
  })
  const bounds = placementBounds(anchors)
  if (!bounds) return undefined
  const value = bounds.right - bounds.left
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

function anchoredFrame(node: IdmlTextNode, styles: IdmlStyle[]): IdmlAnchoredFrame | undefined {
  const story = node.attributes.ParentStory
  if (!story) return undefined
  const setting = node.children.find((child) => child.name === 'Properties')?.children.find((child) => child.name === 'AnchoredObjectSetting')
  const style = flattenedStyle(styles, node.attributes.AppliedObjectStyle, 'object')
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

export function parseAnchoredFrames(stories: IdmlStory[], styles: IdmlStyle[]): IdmlAnchoredFrame[] {
  return stories.flatMap((story) =>
    story.root ? descendants(story.root).flatMap((node) => (node.name === 'TextFrame' ? [anchoredFrame(node, styles)].filter(Boolean) : [])) : [],
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
  const output = [`display:inline-block`, `inline-size:${formatRoundedNumber(frame.width ?? 0)}pt`, `vertical-align:baseline`]
  const fill = frame.fill ? resolveColor(frame.fill) : undefined
  if (fill && fill !== 'none') output.push(`background:${fill}`)
  const stroke = frame.stroke ? resolveColor(frame.stroke.color) : undefined
  if (stroke && stroke !== 'none' && frame.stroke) output.push(`border:${formatRoundedNumber(frame.stroke.weight)}pt solid ${stroke}`)
  output.push(...cornerDeclarations(frame, direction))
  return output.join(';')
}
