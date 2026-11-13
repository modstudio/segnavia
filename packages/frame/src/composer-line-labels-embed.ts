import { embedFunction } from '@segnavia/html'
import { lineKeyedLabelsScript } from '@segnavia/layout'
import { applyLineLabels, galleyLineLabels, resolvedLineLabel, unsettledLineLabels } from './composer-line-labels.ts'

export function embeddedComposerLineLabelFunctions(): string {
  return `${lineKeyedLabelsScript()}\n${embedFunction('galleyLineLabels', galleyLineLabels)}\n${embedFunction(
    'resolvedLineLabel',
    resolvedLineLabel,
  )}\n${embedFunction('applyLineLabels', applyLineLabels)}\n${embedFunction('unsettledLineLabels', unsettledLineLabels)}`
}

export function composerLineLabelConvergenceScript(enabled: boolean): string {
  const labelSteps = enabled
    ? "var fillLabels=function(previous){var filled=applyLineLabels(input,previous,config.lineNumbers,config.lineNoteSeries,document);if(filled.refusals.length){fail(filled.refusals[0]);return false;}if(filled.missing.length){fail('line-keyed note labels for '+filled.missing.join(', ')+' could not be matched to their note bodies and series; keep each generated line label and its declared series to clear this refusal');return false;}return true;};var settleLabels=function(next){var labels=unsettledLineLabels(input,next,config.lineNumbers,config.lineNoteSeries,document);if(labels.refusals.length){fail(labels.refusals[0]);return false;}movedLabels=labels.moved;return true;};"
    : 'var fillLabels=function(){return true;};var settleLabels=function(){return true;};'
  return `${labelSteps}var planConverged=function(){var held=planBookOrFail(input);if(!held)return null;planFolios=held;var moved=[];var movedLabels=[];var convergence=convergeLayout(held,function(previous){fillPageReferences(previous.pages);if(!fillLabels(previous))return null;input=measureInput();var next=planBookOrFail(input);if(!next)return null;planFolios=next;moved=unsettledPageReferences(next.pages);if(!settleLabels(next))return null;return {plan:next,settled:moved.length===0&&movedLabels.length===0};},3);if(!convergence)return null;if(!convergence.converged){if(movedLabels.length)fail('line-keyed note labels for '+movedLabels.join(', ')+' would not settle after three additional compositions; shorten the content or reserve fixed space for line labels to clear this refusal');else fail('page references to '+moved.join(', ')+' would not settle after three additional compositions; shorten the content or reserve fixed space for page references to clear this refusal');return null;}return convergence.plan;};`
}
