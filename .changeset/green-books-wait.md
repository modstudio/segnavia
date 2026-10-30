---
'@segnavia/frame': patch
---

Keep paginated books waiting for a measurable frame when they mount inside a hidden container or behind the flow layout. A book whose source still measures no line boxes, or plans no page, after one second of visible time is refused rather than shown empty.
