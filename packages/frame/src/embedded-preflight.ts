import {
  appendSlotOversetEntries,
  boundPreflightReport,
  fontMissingEntries,
  PREFLIGHT_BLOCK_LIMIT,
  PREFLIGHT_CHECKS,
  PREFLIGHT_DROPPED_IDS_LIMIT,
  PREFLIGHT_FIT_GROUP_LIMIT,
  PREFLIGHT_FIT_SIZE_LIMIT,
  PREFLIGHT_FIT_VALUES_LIMIT,
  PREFLIGHT_FITS_LIMIT,
  PREFLIGHT_FOLIO_LIMIT,
  PREFLIGHT_ISSUES_PER_CHECK,
  PREFLIGHT_MESSAGE_LIMIT,
  PREFLIGHT_PAGES_LIMIT,
  PREFLIGHT_REGION_FIELD_LIMIT,
  PREFLIGHT_REGIONS_LIMIT,
  PREFLIGHT_SUBJECT_LIMIT,
} from '@segnavia/format'
import { embedFunction } from '@segnavia/html'

export const PREFLIGHT_ATTRIBUTE = 'data-segnavia-preflight'

export function publishPreflightReport(report: unknown, attribute: string, message: string, send: (message: unknown) => void): void {
  document.documentElement.setAttribute(attribute, JSON.stringify(report))
  send({ type: message, report })
}

export function embeddedPreflightBounds(): string {
  return `var PREFLIGHT_CHECKS=${JSON.stringify(PREFLIGHT_CHECKS)},PREFLIGHT_ISSUES_PER_CHECK=${PREFLIGHT_ISSUES_PER_CHECK},PREFLIGHT_SUBJECT_LIMIT=${PREFLIGHT_SUBJECT_LIMIT},PREFLIGHT_MESSAGE_LIMIT=${PREFLIGHT_MESSAGE_LIMIT},PREFLIGHT_FOLIO_LIMIT=${PREFLIGHT_FOLIO_LIMIT},PREFLIGHT_BLOCK_LIMIT=${PREFLIGHT_BLOCK_LIMIT},PREFLIGHT_PAGES_LIMIT=${PREFLIGHT_PAGES_LIMIT},PREFLIGHT_FITS_LIMIT=${PREFLIGHT_FITS_LIMIT},PREFLIGHT_FIT_GROUP_LIMIT=${PREFLIGHT_FIT_GROUP_LIMIT},PREFLIGHT_FIT_SIZE_LIMIT=${PREFLIGHT_FIT_SIZE_LIMIT},PREFLIGHT_FIT_VALUES_LIMIT=${PREFLIGHT_FIT_VALUES_LIMIT},PREFLIGHT_REGIONS_LIMIT=${PREFLIGHT_REGIONS_LIMIT},PREFLIGHT_DROPPED_IDS_LIMIT=${PREFLIGHT_DROPPED_IDS_LIMIT},PREFLIGHT_REGION_FIELD_LIMIT=${PREFLIGHT_REGION_FIELD_LIMIT};
${embedFunction('boundPreflightReportImplementation', boundPreflightReport)}
var boundPreflightReport=function(input,profile){return boundPreflightReportImplementation(input,profile,{checks:PREFLIGHT_CHECKS,issuesPerCheck:PREFLIGHT_ISSUES_PER_CHECK,subject:PREFLIGHT_SUBJECT_LIMIT,message:PREFLIGHT_MESSAGE_LIMIT,folio:PREFLIGHT_FOLIO_LIMIT,block:PREFLIGHT_BLOCK_LIMIT,pages:PREFLIGHT_PAGES_LIMIT,fits:PREFLIGHT_FITS_LIMIT,fitGroup:PREFLIGHT_FIT_GROUP_LIMIT,fitSize:PREFLIGHT_FIT_SIZE_LIMIT,fitValues:PREFLIGHT_FIT_VALUES_LIMIT,regions:PREFLIGHT_REGIONS_LIMIT,droppedIds:PREFLIGHT_DROPPED_IDS_LIMIT,regionCount:PREFLIGHT_REGION_FIELD_LIMIT,regionId:PREFLIGHT_SUBJECT_LIMIT});};`
}

export function embeddedSurfacePreflight(profile: import('@segnavia/format').PreflightProfile, attribute: string, message: string): string {
  return `${embeddedPreflightBounds()}
${embedFunction('appendSlotOversetEntries', appendSlotOversetEntries)}
${embedFunction('fontMissingEntries', fontMissingEntries)}
${embedFunction('publishPreflightReport', publishPreflightReport)}
var surfacePreflightProfile=${JSON.stringify(profile)};
var publishSurfacePreflight=function(slots,failures){var entries=[];if(surfacePreflightProfile['slot-overset']!=='off')appendSlotOversetEntries(slots||{},entries);if(surfacePreflightProfile['font-missing']!=='off')entries=entries.concat(fontMissingEntries(failures||[]));var report=boundPreflightReport({entries:entries,facts:{pageCount:1,pages:[],fits:[],regions:[]}},surfacePreflightProfile);publishPreflightReport(report,'${attribute}','${message}',post);};`
}
