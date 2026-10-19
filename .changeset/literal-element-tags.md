---
'@segnavia/react': patch
---

Give each `segnavia-*` React intrinsic its own tag literal, so a host `ElementType` still typechecks as JSX and each tag exposes only its own props.
