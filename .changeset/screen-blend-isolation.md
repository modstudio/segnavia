---
"@segnavia/render": patch
---

Capture a backdrop-filter JPEG of only the filtered backdrop and install it beneath the element's own background layers, promoting a non-transparent background-color to a solid layer above that JPEG, then hoist the JPEG out of a transparency group that uses a non-Normal blend, so screen-blended text composites against the group's fill as it does on screen.
