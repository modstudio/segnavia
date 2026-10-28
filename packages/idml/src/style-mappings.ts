export type StylePropertyMapping = { kind: 'css'; css: string } | { kind: 'direction' | 'language' | 'font' | 'columns' | 'non-formatting' }

const css = (name: string): StylePropertyMapping => ({ kind: 'css', css: name })
const nonFormatting: StylePropertyMapping = { kind: 'non-formatting' }

// This is the single census of IDML properties the story and CSS mappers consume.
export const STYLE_PROPERTY_MAPPINGS: Readonly<Record<string, StylePropertyMapping>> = {
  PointSize: css('font-size'),
  Leading: css('line-height'),
  AutoLeading: css('line-height'),
  Tracking: css('letter-spacing'),
  SpaceBefore: css('margin-block-start'),
  SpaceAfter: css('margin-block-end'),
  FirstLineIndent: css('text-indent'),
  Capitalization: css('capitalization'),
  Underline: css('text-decoration-line'),
  FillColor: css('color'),
  LeftIndent: css('padding-inline'),
  RightIndent: css('padding-inline'),
  Justification: css('text-align'),
  KeepWithNext: css('keeps'),
  KeepLinesTogether: css('keeps'),
  KeepAllLinesTogether: css('keeps'),
  KeepFirstLines: css('keeps'),
  KeepLastLines: css('keeps'),
  StartParagraph: css('starts'),
  ParagraphDirection: { kind: 'direction' },
  AppliedLanguage: { kind: 'language' },
  AppliedFont: { kind: 'font' },
  FontStyle: { kind: 'font' },
  SpanColumnType: { kind: 'columns' },
  Self: nonFormatting,
  Name: nonFormatting,
  BasedOn: nonFormatting,
  AppliedParagraphStyle: nonFormatting,
  AppliedCharacterStyle: nonFormatting,
  EmitCss: nonFormatting,
  StyleUniqueId: nonFormatting,
  KeyboardShortcut: nonFormatting,
  ExtendedKeyboardShortcut: nonFormatting,
  Imported: nonFormatting,
  PreviewColor: nonFormatting,
  IncludeClass: nonFormatting,
  EpubAriaRole: nonFormatting,
  SplitDocument: nonFormatting,
  NextStyle: nonFormatting,
}

export function stylePropertyMapping(name: string): StylePropertyMapping | undefined {
  return STYLE_PROPERTY_MAPPINGS[name]
}
