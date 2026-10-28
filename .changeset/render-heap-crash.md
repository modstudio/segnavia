---
'@segnavia/render': minor
---

Cap every renderer's JavaScript heap at 2048 MB, including hosts that passed no jsHeapMb (`jsHeapMb` changes it), refuse a crashed page, relaunch a dead browser, and refuse work after close.
