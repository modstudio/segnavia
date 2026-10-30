---
'@segnavia/format': minor
'@segnavia/html': minor
'@segnavia/frame': minor
---

A paginated page's text area now follows its parent page's margins.

- **Per page:** text height follows each page's parent. The text box, columns, windows and furniture strips are sized from the parent page, on screen and in the PDF.
- **Per flow:** a flowing section's opener, recto and verso parents must leave one text width. A mismatch is refused at print and at IDML import, naming the parents and both widths.
- **Galley image cap:** the shortest of the flow's parent text heights.
- **Opener refusal:** a section's first content that does not fit its opener is refused, naming the opener parent.
- **Margins:** every resolved parent page must leave a positive text area.
- **Window edges:** cloned window edges keep the galley's pixel phase, so pointed Hebrew marks are not clipped.
