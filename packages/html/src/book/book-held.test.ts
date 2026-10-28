import { describe, expect, test } from 'bun:test'
import { markPlacementIssues } from './book-held.ts'

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
