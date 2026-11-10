import {
  boundPreflightReport,
  PREFLIGHT_BLOCK_LIMIT,
  PREFLIGHT_CHECKS,
  PREFLIGHT_FIT_GROUP_LIMIT,
  PREFLIGHT_FIT_SIZE_LIMIT,
  PREFLIGHT_FITS_LIMIT,
  PREFLIGHT_FOLIO_LIMIT,
  PREFLIGHT_ISSUES_PER_CHECK,
  PREFLIGHT_MESSAGE_LIMIT,
  PREFLIGHT_PAGES_LIMIT,
  PREFLIGHT_SUBJECT_LIMIT,
  preflightRefusal,
} from '@segnavia/format'
import { embedFunction } from '@segnavia/html'

export function embeddedPreflightFunctions(): string {
  return `var PREFLIGHT_CHECKS=${JSON.stringify(PREFLIGHT_CHECKS)},PREFLIGHT_ISSUES_PER_CHECK=${PREFLIGHT_ISSUES_PER_CHECK},PREFLIGHT_SUBJECT_LIMIT=${PREFLIGHT_SUBJECT_LIMIT},PREFLIGHT_MESSAGE_LIMIT=${PREFLIGHT_MESSAGE_LIMIT},PREFLIGHT_FOLIO_LIMIT=${PREFLIGHT_FOLIO_LIMIT},PREFLIGHT_BLOCK_LIMIT=${PREFLIGHT_BLOCK_LIMIT},PREFLIGHT_PAGES_LIMIT=${PREFLIGHT_PAGES_LIMIT},PREFLIGHT_FITS_LIMIT=${PREFLIGHT_FITS_LIMIT},PREFLIGHT_FIT_GROUP_LIMIT=${PREFLIGHT_FIT_GROUP_LIMIT},PREFLIGHT_FIT_SIZE_LIMIT=${PREFLIGHT_FIT_SIZE_LIMIT};
var boundedPreflightText=function(value,limit){return typeof value==='string'?value.slice(0,limit):undefined;};
var boundedPreflightLocation=function(value){if(!value||typeof value!=='object'||Array.isArray(value))return undefined;var folio=boundedPreflightText(value.folio,PREFLIGHT_FOLIO_LIMIT),block=boundedPreflightText(value.block,PREFLIGHT_BLOCK_LIMIT);return folio===undefined&&block===undefined?undefined:Object.assign({},folio===undefined?{}:{folio:folio},block===undefined?{}:{block:block});};
var boundedPreflightEntry=function(value,profile,order){if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.check!=='string'||PREFLIGHT_CHECKS.indexOf(value.check)<0)return undefined;var check=value.check,severity=profile[check];if(severity==='off')return undefined;var subject=boundedPreflightText(value.subject,PREFLIGHT_SUBJECT_LIMIT),message=boundedPreflightText(value.message,PREFLIGHT_MESSAGE_LIMIT);if(subject===undefined||message===undefined)return undefined;var location=boundedPreflightLocation(value.location);return Object.assign({check:check,subject:subject,message:message,id:check+':'+subject,severity:severity},location?{location:location}:{},{order:order});};
var boundedPreflightFacts=function(value){if(!value||typeof value!=='object'||Array.isArray(value)||!Number.isSafeInteger(value.pageCount)||value.pageCount<0||!Array.isArray(value.pages)||!Array.isArray(value.fits))return {pageCount:0,pages:[],fits:[]};var pages=value.pages.slice(0,PREFLIGHT_PAGES_LIMIT).flatMap(function(page){if(!page||typeof page!=='object'||Array.isArray(page))return [];var folio=boundedPreflightText(page.folio,PREFLIGHT_FOLIO_LIMIT);if(folio===undefined)return [];var first=boundedPreflightText(page.first,PREFLIGHT_BLOCK_LIMIT),last=boundedPreflightText(page.last,PREFLIGHT_BLOCK_LIMIT);return [Object.assign({folio:folio},first===undefined?{}:{first:first},last===undefined?{}:{last:last})];});var fits=value.fits.slice(0,PREFLIGHT_FITS_LIMIT).flatMap(function(fit){if(!fit||typeof fit!=='object'||Array.isArray(fit))return [];var group=boundedPreflightText(fit.group,PREFLIGHT_FIT_GROUP_LIMIT),size=boundedPreflightText(fit.size,PREFLIGHT_FIT_SIZE_LIMIT);return group===undefined||size===undefined?[]:[{group:group,size:size}];});return {pageCount:value.pageCount,pages:pages,fits:fits};};
${embedFunction('boundPreflightReport', boundPreflightReport)}
${embedFunction('preflightRefusal', preflightRefusal)}`
}
