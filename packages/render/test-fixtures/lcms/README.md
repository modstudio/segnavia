# LittleCMS test reference

This fixture is LittleCMS compiled to WebAssembly, taken from the npm package
`lcms-wasm` 1.0.5. It is a reference that the color tests compare against. It
is never imported by library code and is not included in the published package.

- `dist/lcms.js` is the package's unminified `dist/lcms.js` loader. SHA-256:
  `1a5c8f81186211856ba7c5d6841e35fe3fa901b857a247f72318e1652c5e1cec`.
- `dist/lcms.wasm` is the package's `dist/lcms.wasm` binary. SHA-256:
  `dbcbee3fb3a49459a60bb6b29d6ab25fe7c219b0cc0c2b9579c0cc78f7390ddd`.
- `LICENSE.md` is the package's unchanged `LICENSE.md`. SHA-256:
  `0ab16b2bfb8b51ce0889f89b59724f9f8f15a5af5d32965f75b7949010fe0383`.
- `LICENSE-LittleCMS.txt` is the unchanged `LICENSE` from the LittleCMS source
  distribution. SHA-256:
  `6dbd60437f8ef91d8de1f08ad75882547fd4931bfcc3566a0735f28db1484d31`.

To refresh the fixture, obtain the intended `lcms-wasm` package and matching
LittleCMS source distribution, copy the four upstream files listed above
without editing them, update their hashes here, and run the color tests and
manual profile comparison.
