import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readPgm, readPpm } from './pdf-raster.ts'

test('raster readers consume the header separator without consuming dark first pixels', () => {
  const work = mkdtempSync(path.join(tmpdir(), 'segnavia-raster-'))
  try {
    const ppm = path.join(work, 'sample.ppm')
    const pgm = path.join(work, 'sample.pgm')
    writeFileSync(ppm, Buffer.concat([Buffer.from('P6\n1 1\n255\n'), Buffer.from([20, 150, 75])]))
    writeFileSync(pgm, Buffer.concat([Buffer.from('P5\r\n1 1\r\n255\r\n'), Buffer.from([20])]))
    expect([...readPpm(ppm).pixels]).toEqual([20, 150, 75])
    expect([...readPgm(pgm).pixels]).toEqual([20])
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
})
