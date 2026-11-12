import { writeBookCopyfitDemo } from './build-book-copyfit-demo.ts'
import { writeBookMeasuredPropertiesDemo } from './build-book-measured-properties-demo.ts'

export async function writeBookFeatureDemos(site: string, fontCss: string): Promise<void> {
  await writeBookCopyfitDemo(site)
  writeBookMeasuredPropertiesDemo(site, fontCss)
}
