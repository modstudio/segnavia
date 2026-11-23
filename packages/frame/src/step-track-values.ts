export interface StepTrackSliderValues {
  'aria-valuemin': string
  'aria-valuemax': string
  'aria-valuenow': string
  'aria-valuetext': string
}

export function stepTrackSliderValues(
  currentIndex: number,
  slideCount: number,
  title: string | undefined,
  slideLabel: (number: number, total: number, title?: string) => string,
): StepTrackSliderValues {
  const currentSlide = currentIndex + 1
  return {
    'aria-valuemin': '1',
    'aria-valuemax': String(slideCount),
    'aria-valuenow': String(currentSlide),
    'aria-valuetext': slideLabel(currentSlide, slideCount, title),
  }
}
