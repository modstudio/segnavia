import { describe, expect, test } from 'bun:test'
import { parse } from '../sanitize.ts'
import { collectHeadings } from './book-held.ts'

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
