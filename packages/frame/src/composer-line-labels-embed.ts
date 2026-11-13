import { embedFunction } from '@segnavia/html'
import { lineKeyedLabelsScript } from '@segnavia/layout'
import { applyLineLabels, lineLabelValues, unsettledLineLabels } from './composer-line-labels.ts'

export function embeddedComposerLineLabelFunctions(): string {
  return `${lineKeyedLabelsScript()}\n${embedFunction('lineLabelValues', lineLabelValues)}\n${embedFunction('applyLineLabels', applyLineLabels)}\n${embedFunction(
    'unsettledLineLabels',
    unsettledLineLabels,
  )}`
}
