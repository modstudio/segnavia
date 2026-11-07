import { describe, expect, test } from 'bun:test'
import { parse } from '../sanitize.ts'
import { collectHeadings, markPlacementIssues } from './book-held.ts'

describe('collectHeadings', () => {
  test('separates line breaks and block children in heading text', () => {
    const document = parse(
      '<h1 data-segnavia-id="heading-1">Part<br>One</h1><h1 data-segnavia-id="heading-2">חלק<br>ראשון</h1><h1 data-segnavia-id="heading-3">Before<div>Middle</div>After</h1><h1 data-segnavia-id="heading-4">Part<!--note-->One</h1><h1 data-segnavia-id="heading-5">Part<style>p{color:red}</style>One</h1><h1 data-segnavia-id="heading-6">Part<template>hidden</template>One</h1>',
    )

    expect(collectHeadings(document.children, 'section', 6, 1).map((heading) => heading.text)).toEqual([
      'Part One',
      'חלק ראשון',
      'Before Middle After',
      'PartOne',
      'PartOne',
      'PartOne',
    ])
  })
})

describe('markPlacementIssues', () => {
  const issues = (head: string, foot?: string) => markPlacementIssues([{ name: 'body', head, foot }])

  test('derives required and known mark fields from the furniture catalog', () => {
    expect(issues('<span data-motif="segnavia:mark" data-motif-name=""></span>')).toEqual([
      'parent page "body" mark has an empty name; set a non-empty data-motif-name on the segnavia:mark placement to clear this refusal',
    ])
    expect(issues('', '<span data-motif="segnavia:mark" data-motif-name="siman" data-motif-side="outer"></span>')).toEqual([
      'parent page "body" mark has unknown field "side"; use only name and which to clear this refusal',
    ])
  })

  test('refuses a which outside the catalog choices and names its value', () => {
    expect(issues('<span data-motif="segnavia:mark" data-motif-name="siman" data-motif-which="end"></span>')).toEqual([
      'parent page "body" mark has unknown which value "end"; use first or last to clear this refusal',
    ])
    expect(issues('<span data-motif="segnavia:mark" data-motif-name="siman" data-motif-which="first"></span>')).toEqual([])
  })

  test('matches the mark motif value exactly', () => {
    expect(issues('<span data-motif="SEGNAVIA:MARK" data-motif-name=""></span>')).toEqual([])
  })
})
