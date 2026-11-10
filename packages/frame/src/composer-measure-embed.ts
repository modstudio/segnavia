import { embedFunction } from '@segnavia/html'
import { applyBoxDecorations, backgroundPaints, decorationEdges, parseBoxShadows, shadowParts } from './composer-decoration.ts'
import {
  composerLayoutReady,
  descendantKeepSignals,
  forcedPageBreak,
  inlineLevelDisplay,
  keepSignals,
  measuredBlockConstraints,
  measuredCandidateKeeps,
  measuredCandidateRun,
  measuredKeepRuns,
  measureLineBoxes,
  measurementRefusal,
  outermostKeepValue,
  sizeFlowGalley,
  tableRowLines,
} from './composer-measure.ts'

export function embeddedComposerMeasureFunctions(): string {
  const functions = [
    keepSignals,
    outermostKeepValue,
    descendantKeepSignals,
    inlineLevelDisplay,
    measuredBlockConstraints,
    measuredCandidateRun,
    measuredCandidateKeeps,
    measuredKeepRuns,
    backgroundPaints,
    shadowParts,
    parseBoxShadows,
    decorationEdges,
    applyBoxDecorations,
    forcedPageBreak,
    composerLayoutReady,
    sizeFlowGalley,
    tableRowLines,
    measureLineBoxes,
    measurementRefusal,
  ]
  return functions.map((fn) => embedFunction(fn.name, fn)).join('\n')
}
