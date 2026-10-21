import { writeFileSync } from 'node:fs'
import path from 'node:path'

export function buildPaperPickerDemo(site: string): void {
  writeFileSync(
    path.join(site, 'paper-picker.html'),
    `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{margin:0;padding:24px;background:#f4f4f2;font-family:system-ui}main{max-width:560px;margin:auto}output{display:block;margin-block-start:20px;direction:ltr}</style>
    </head><body><main><segnavia-paper-picker></segnavia-paper-picker><output></output></main>
      <script type="module" src="segnavia-controls.js"></script>
      <script type="module">
        await customElements.whenDefined('segnavia-paper-picker')
        const picker = document.querySelector('segnavia-paper-picker')
        const output = document.querySelector('output')
        picker.value = { paper: 'a4', orientation: 'portrait' }
        output.value = JSON.stringify(picker.value)
        picker.addEventListener('change', (event) => { output.value = JSON.stringify(event.detail) })
      </script>
    </body></html>`,
  )
}
