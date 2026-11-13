# Form fields

Content HTML can include print-safe fields without native form controls. A checkbox or answer line is a `span`; an answer box is a `div`.

```html
<span data-segnavia-field="checkbox"></span>
<span data-segnavia-field="checkbox" data-segnavia-field-checked></span>
<span data-segnavia-field="line"></span>
<span data-segnavia-field="line" data-segnavia-field-length="12ch">answer</span>
<div data-segnavia-field="box" data-segnavia-field-lines="3" data-segnavia-field-rule="ruled">worked answer</div>
```

A line length is a positive `em` or `ch` value in canonical form, such as `1.5em` or `12ch`. Equivalent spellings such as `1.50em` are refused because the size sheet matches the attribute's text. Without a length, a filling line sits directly in its block, such as a `p`, `li`, or `td`; inside inline formatting such as `strong` or `a`, give the line a length. The filling line gives its parent `position: relative` and `overflow-x: clip` through `:has()`; author CSS that positions children from that block must account for that containing-block side effect. Its rule starts where the answer starts and runs to the block's inline end.

An answer box is one writing line high by default. `data-segnavia-field-lines` accepts a whole number from 1 through 99 without leading zeros, and `data-segnavia-field-rule` is `plain` (the default) or `ruled`. Equivalent line-count spellings such as `05` are refused because the size sheet matches the attribute's text. Text inside a line or box is the filled answer. Checkbox size follows the surrounding text; the checked attribute is a presence attribute.

Answers take their direction from the normal rules: `dir`, then `lang`, then the first strong letter. In a right-to-left block, a filling line runs leftward to the block's inline end. A checkbox mark is the same shape in either direction; boxes follow logical sides.

Markdown task items (`- [ ]` and `- [x]`) become the same checkbox field spans. They never create an HTML `input`.

Field appearance can be set with `--segnavia-field-rule-color`, `--segnavia-field-rule-width`, `--segnavia-field-box-color`, `--segnavia-field-answer-color`, `--segnavia-field-answer-font`, and `--segnavia-field-mark-color`.
